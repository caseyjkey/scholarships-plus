import { Link } from "@remix-run/react";

export default function EssaysIndexPage() {
  return (
    <>
      <p>
        No essay selected. Select an essay on the left, or{" "}
        <Link to="new" className="text-blue-500 underline">
          create a new essay.
        </Link>
      </p>
      <button class="bg-blue-500 text-white mt-6 px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600">
        Import From Google Drive
      </button>
    </>
  );
}
