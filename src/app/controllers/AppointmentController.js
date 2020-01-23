import { startOfHour, parseISO, isBefore, format, subHours } from "date-fns";
import Mail from "../../lib/Mail";
import pt from "date-fns/locale/pt";
import * as Yup from "yup";

import Notification from "../schemas/Notification";

import Appointment from "../models/Appointment";
import User from "../models/User";
import File from "../models/File";
import Queue from "../../lib/Queue";
import CancellationMail from "../jobs/CancellationMail";

class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;

    const appointments = await Appointment.findAll({
      where: { user_id: req.userId, canceled_at: null },
      attributes: ["id", "date", "past", "cancelable"],
      order: ["date"],
      limit: 20,
      offset: (page - 1) * 20,
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["id", "name"],
          include: [
            {
              model: File,
              as: "avatar",
              attributes: ["url", "path", "id"]
            }
          ]
        }
      ]
    });

    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      provider_id: Yup.number().required(),
      date: Yup.date().required()
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: "Validation fails" });
    }

    const { provider_id, date } = req.body;

    /*
      Check if provider is a provider
    */

    const isProvider = await User.findOne({
      where: { id: provider_id, provider: true }
    });

    if (!isProvider) {
      return res.status(401).json({
        error: "Fornecedor não cadastrado."
      });
    }

    //check for past dates
    const hourStart = startOfHour(parseISO(date));

    if (isBefore(hourStart, new Date())) {
      return res.status(400).json({
        error: "Past dates are not permitted."
      });
    }

    const checkAvailabity = await Appointment.findOne({
      where: {
        provider_id,
        canceled_at: null,
        date: hourStart
      }
    });

    if (checkAvailabity) {
      return res.status(400).json({
        error: "Appointment date is not avalable."
      });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date
    });

    //Notificação de novo agendamento para o provedor
    const user = await User.findByPk(req.userId);
    const formattedDate = format(
      hourStart,
      "'dia ' dd 'de ' MMMM', às' H:mm'h'",
      { locale: pt }
    );
    await Notification.create({
      content: `Novo agendamento de ${user.name} para o ${formattedDate}`,
      user: provider_id
    });

    return res.json(appointment);
  }

  async delete(req, res) {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: "provider",
          attributes: ["email", "name"]
        },
        {
          model: User,
          as: "user",
          attributes: ["name"]
        }
      ]
    });

    if (appointment.user_id === req.body.userId) {
      return res.status(401).json({
        error: "You don`t have permission to cancel this appointment"
      });
    }

    const dateWithSub = subHours(appointment.date, 2);

    if (isBefore(dateWithSub, new Date())) {
      return res.status(401).json({
        error: "You can only cancel appoitments 2 hours in advance."
      });
    }
    appointment.canceled_at = new Date();
    appointment.save();

    //ENVIANDO PARA FILA
    await Queue.add(CancellationMail.key, {
      appointment
    });

    return res.json(appointment);
  }
}

export default new AppointmentController();
