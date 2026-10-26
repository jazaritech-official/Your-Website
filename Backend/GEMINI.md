# Backend Playbook - Irhas'Inn

This file configures preferences and guidelines for working on the Node.js/Express.js backend.

## Tech Stack
- **Framework**: Express.js (v5.2.1)
- **Database**: MongoDB via Mongoose (v8.17.2)
- **Module System**: ES Modules (`"type": "module"`)
- **Integrations**:
  - WhatsApp Web (`whatsapp-web.js`)
  - Cloudinary for media uploads
  - Nodemailer for email sending
  - Twilio for SMS/OTP

## Backend Coding Rules
- **Imports**: Always include the `.js` extension for local relative imports in the backend (e.g., `import { Order } from "../Models/Orders.js"`).
- **Controllers & Routes**:
  - Keep route definitions in [Backend/Routes](file:///E:/Sibghat%20Ullah/Irhas'Inn%20Trendy%20Store/Backend/Routes) and their implementations in [Backend/Controllers](file:///E:/Sibghat%20Ullah/Irhas'Inn%20Trendy%20Store/Backend/Controllers).
  - Do not put database logic directly in route definitions.
- **Database Models**:
  - Define models in [Backend/Models](file:///E:/Sibghat%20Ullah/Irhas'Inn%20Trendy%20Store/Backend/Models).
  - Use Mongoose schemas with validation and ti0mestamps enabled.
- **Error Handling**:
  - Use custom middleware or try/catch blocks in controllers.
  - Return clean JSON error responses with proper HTTP status codes.
- **Security**:
  - Use `helmet` and `express-rate-limit` for security.
  - Store sensitive credentials in `.env` and load them via `dotenv`. Never commit credentials.
