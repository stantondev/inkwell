defmodule InkwellWeb.SupportController do
  use InkwellWeb, :controller

  alias Inkwell.Email

  require Logger

  # POST /api/support/contact
  def contact(conn, params) do
    # Honeypot check — bots fill hidden fields
    if params["website"] && params["website"] != "" do
      json(conn, %{ok: true})
    else
      with {:ok, category} <- validate_category(params["category"]),
           {:ok, email} <- validate_email(params["email"]),
           {:ok, subject} <- validate_string(params["subject"], "subject", 200),
           {:ok, message} <- validate_string(params["message"], "message", 5000) do
        username = params["username"]

        Task.start(fn ->
          Email.send_support_request(email, category, subject, message, username)
        end)

        json(conn, %{ok: true})
      else
        {:error, reason} ->
          conn
          |> put_status(422)
          |> json(%{error: reason})
      end
    end
  end

  # ── Validation helpers ──

  defp validate_category(nil), do: {:ok, "other"}
  defp validate_category(cat) when cat in ~w(account bug billing report feature other), do: {:ok, cat}
  defp validate_category(_), do: {:error, "Invalid category"}

  defp validate_email(nil), do: {:error, "Email is required"}
  defp validate_email(email) when is_binary(email) do
    trimmed = String.trim(email)
    if String.length(trimmed) > 0 and String.contains?(trimmed, "@") do
      {:ok, trimmed}
    else
      {:error, "A valid email is required"}
    end
  end
  defp validate_email(_), do: {:error, "A valid email is required"}

  defp validate_string(nil, field, _max), do: {:error, "#{String.capitalize(field)} is required"}
  defp validate_string(value, field, max) when is_binary(value) do
    trimmed = String.trim(value)
    cond do
      String.length(trimmed) == 0 -> {:error, "#{String.capitalize(field)} is required"}
      String.length(trimmed) > max -> {:error, "#{String.capitalize(field)} is too long (max #{max} characters)"}
      true -> {:ok, trimmed}
    end
  end
  defp validate_string(_, field, _max), do: {:error, "#{String.capitalize(field)} is required"}
end
