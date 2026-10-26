import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { debugLog } from "./debugLog.js";

dotenv.config();

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    const password = process.env.PASSWORD.replace(/\s/g, "");

    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL,
        pass: password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
  }
  return transporter;
};

export const sendEmail = async (to, subject, text, html, attachments = []) => {
  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: `Irhas'Inn <${process.env.EMAIL}>`,
      to,
      subject,
      text,
      html,
      replyTo: process.env.EMAIL,
      attachments,
      headers: {
        "X-Priority": "3",
        "X-Mailer": "Irhas'Inn",
      },
    };

    await transporter.sendMail(mailOptions);
    debugLog("Email sent successfully to:", to);
    return true;
  } catch (err) {
    console.error("Error sending email: ", err.message || err);
    throw err;
  }
};

import { randomInt } from "crypto";

export const generateOTP = () => {
  // SECURITY: Use crypto.randomInt() for cryptographically secure OTP generation.
  // Math.random() is not suitable for security-sensitive values.
  return randomInt(100000, 999999);
};
