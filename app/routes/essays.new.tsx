import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { useEffect, useRef } from "react";

import { createEssay } from "~/models/essay.server";
import { requireUserId } from "~/session.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);

  const formData = await request.formData();
  const essayPrompt = formData.get("essayPrompt");
  const body = formData.get("body");

  if (typeof essayPrompt !== "string" || essayPrompt.length === 0) {
    return json(
      { errors: { body: null, essayPrompt: "Essay prompt is required" } },
      { status: 400 },
    );
  }

  if (typeof body !== "string" || body.length === 0) {
    return json(
      { errors: { body: "Body is required", essayPrompt: null } },
      { status: 400 },
    );
  }

  const essay = await createEssay({ body, essayPrompt, userId });

  return redirect(`/essays/${essay.id}`);
};

export default function NewNotePage() {
  const actionData = useActionData<typeof action>();
  const essayPromptRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (actionData?.errors?.essayPrompt) {
      essayPromptRef.current?.focus();
    } else if (actionData?.errors?.body) {
      bodyRef.current?.focus();
    }
  }, [actionData]);

  return (
    <Form
      method="post"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "100%",
      }}
    >
      <div>
        <label className="flex w-full flex-col gap-1">
          <span>Essay prompt: </span>
          <input
            ref={essayPromptRef}
            name="essayPrompt"
            className="flex-1 rounded-md border-2 border-blue-500 px-4 py-3 text-lg leading-loose min-h-[44px]"
            aria-invalid={actionData?.errors?.essayPrompt ? true : undefined}
            aria-errormessage={
              actionData?.errors?.essayPrompt ? "essayPrompt-error" : undefined
            }
          />
        </label>
        {actionData?.errors?.essayPrompt ? (
          <div className="pt-1 text-red-700" id="essayPrompt-error">
            {actionData.errors.essayPrompt}
          </div>
        ) : null}
      </div>

      <div>
        <label className="flex w-full flex-col gap-1">
          <span>Body: </span>
          <textarea
            ref={bodyRef}
            name="body"
            rows={8}
            className="w-full flex-1 rounded-md border-2 border-blue-500 px-4 py-3 text-lg leading-6 min-h-[100px]"
            aria-invalid={actionData?.errors?.body ? true : undefined}
            aria-errormessage={
              actionData?.errors?.body ? "body-error" : undefined
            }
          />
        </label>
        {actionData?.errors?.body ? (
          <div className="pt-1 text-red-700" id="body-error">
            {actionData.errors.body}
          </div>
        ) : null}
      </div>

      <div className="text-right">
        <button
          type="submit"
          className="rounded bg-blue-500 px-4 py-3 text-white hover:bg-blue-600 focus:bg-blue-400 min-h-[44px]"
        >
          Save
        </button>
      </div>
    </Form>
  );
}
