import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const SECRET = process.env.SECRET;

export const generateToken = (user) => {
  return jwt.sign({ userId: user.id, email: user.email }, SECRET, {
    expiresIn: "1d",
  });
};

export const verifyToken = (token) => {
  return jwt.verify(token, SECRET);
};
