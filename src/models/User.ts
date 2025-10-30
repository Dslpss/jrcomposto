import { Schema, models, model } from "mongoose";

export interface IUser {
  email: string;
  name?: string;
  passwordHash: string;
  data?: unknown; // dados do usuário (ex.: cenários)
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    passwordHash: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const User = models.User || model<IUser>("User", UserSchema);
