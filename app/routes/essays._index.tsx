import { Link } from "@remix-run/react";

export default function EssaysIndexPage() {
  return (
    <p>
      No essay selected. Select an essay on the left, or{" "}
      <Link to="new" className="text-blue-500 underline">
        create a new essay.
      </Link>
    </p>
  );
}
