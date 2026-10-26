import { Suspense } from "react";
import OtpContent from "./OtpContent";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OtpContent />
    </Suspense>
  );
}
