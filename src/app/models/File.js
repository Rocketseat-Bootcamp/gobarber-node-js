import Sequelize, { Model } from "sequelize";
import bcrypt from "bcrypt";

class File extends Model {
  static init(sequelize) {
    super.init(
      {
        name: Sequelize.STRING,
        path: Sequelize.STRING,
        url: {
          type: Sequelize.VIRTUAL,
          get() {
            return `${process.env.APP_URL}/files/${this.path}`;
          }
        }
      },
      {
        sequelize
      }
    );
    return this;
  }
}

export default File;
