"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { RootState } from "../Redux/store";
import nprogress from "nprogress";
import "nprogress/nprogress.css";

nprogress.configure({ showSpinner: false, minimum: 0.15, speed: 400, trickleSpeed: 200 });

const RouteProgressBar = () => {
  // Inject custom nprogress styles with brand color
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "nprogress-custom-styles";
    style.textContent = `
      #nprogress .bar {
        background: #C8A84E !important;
        height: 3px !important;
        box-shadow: 0 0 10px #C8A84E, 0 0 5px #C8A84E !important;
      }
      #nprogress .peg {
        box-shadow: 0 0 10px #C8A84E, 0 0 5px #C8A84E !important;
      }
      #nprogress .spinner-icon {
        border-top-color: #C8A84E !important;
        border-left-color: #C8A84E !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existing = document.getElementById("nprogress-custom-styles");
      if (existing) existing.remove();
    };
  }, []);
  const pathname = usePathname();
  const loading = useSelector((state: RootState) => state.ui.loading);
  const [active, setActive] = useState(false);
  const prevPath = useRef(pathname);

  // Start the bar whenever the route changes or the global loading flag is on.
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      nprogress.start();
      setActive(true);
    }
    if (loading) {
      nprogress.start();
      setActive(true);
    }
  }, [pathname, loading]);

  // Once the page is settled (pathname stable and not loading), finish it.
  useEffect(() => {
    if (active && !loading) {
      const t = setTimeout(() => {
        nprogress.done();
        setActive(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [active, loading, pathname]);

  return null;
};

export default RouteProgressBar;
