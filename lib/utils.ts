import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a price string or number with spaces as thousands separators.
 * Example: 1000000 -> "1 000 000"
 */
export const formatPrice = (price: string | number | undefined): string => {
  if (price === undefined || price === null) return "";
  const stringPrice = price.toString();
  return stringPrice.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};
