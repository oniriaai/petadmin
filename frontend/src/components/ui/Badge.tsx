import React from "react";
import { cls } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  color?: string;
  className?: string;
}

export function Badge({ children, color = "bg-gray-100 text-gray-700", className }: Props) {
  return <span className={cls("badge", color, className)}>{children}</span>;
}
