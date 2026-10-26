# Frontend Playbook - Irhas'Inn

This file configures preferences and guidelines for working on the React/Next.js frontend.

## Tech Stack
- **Framework**: Next.js 15.5+ (App Router)
- **Language**: TypeScript + Tailwind CSS v4
- **State Management**: Redux Toolkit (`react-redux`, `@reduxjs/toolkit`)
- **API Client**: Axios

## Frontend Coding Rules
- **Components**:
  - Keep components modular and reusable under [Frontend/src/app/Components](file:///E:/Sibghat%20Ullah/Irhas'Inn%20Trendy%20Store/Frontend/src/app/Components).
  - Use functional components with TypeScript props/types.
- **Routing & Pages**:
  - Place pages in [Frontend/src/app](file:///E:/Sibghat%20Ullah/Irhas'Inn%20Trendy%20Store/Frontend/src/app) according to Next.js App Router conventions.
  - Ensure Client components use the `"use client"` directive.
- **Styling**:
  - Use Tailwind CSS v4 class utilities.
  - Define layout structures using CSS grid or flexbox in layout files.
- **Redux State**:
  - Configure slices under [Frontend/src/app/Redux](file:///E:/Sibghat%20Ullah/Irhas'Inn%20Trendy%20Store/Frontend/src/app/Redux).
  - Use typed hooks if available, or standard `useDispatch` and `useSelector`.
