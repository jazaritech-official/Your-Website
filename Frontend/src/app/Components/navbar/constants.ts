/* Static navigation data. Moved out of Navbar.tsx verbatim so the container
   and every presentational piece read the same lists. */

export interface NavLink {
  name: string;
  href: string;
  isHash?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { name: "Home", href: "/" },
  { name: "Products", href: "/productsPage" },
  { name: "About", href: "/#about", isHash: true },
  { name: "Contact Us", href: "/#contact", isHash: true },
];

export const CATEGORIES = ["All", "Clothes", "Accessories", "Pens", "Scrubs"];
