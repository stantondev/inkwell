defmodule InkwellWeb.PenPalExchangeController do
  @moduledoc "The pen pal exchange: ask Inkwell to introduce you to someone."
  use InkwellWeb, :controller

  alias Inkwell.PenPalExchange
  alias InkwellWeb.LetterJSON

  # GET /api/pen-pal-exchange
  def show(conn, _params) do
    json(conn, %{data: render_status(conn.assigns.current_user)})
  end

  # POST /api/pen-pal-exchange {"note"?}
  def create(conn, params) do
    user = conn.assigns.current_user
    note = if is_binary(params["note"]), do: params["note"], else: nil

    case PenPalExchange.join(user, note) do
      {:ok, :matched, conv} ->
        json(conn, %{data: render_status(user), matched: true, conversation_id: conv.id})

      {:ok, :waiting} ->
        json(conn, %{data: render_status(user), matched: false})

      {:error, reason} ->
        {status, message} = refusal(reason)
        conn |> put_status(status) |> json(%{error: message, code: to_string(reason)})
    end
  end

  # DELETE /api/pen-pal-exchange — take your name back out
  def delete(conn, _params) do
    user = conn.assigns.current_user
    PenPalExchange.leave(user)
    json(conn, %{data: render_status(user)})
  end

  defp refusal(:waiting), do: {:conflict, "Your name is already in. We'll tell you when someone else asks."}
  defp refusal(:no_entry), do: {:forbidden, "Publish your first entry, then come back: it gives your pen pal something to read."}

  defp refusal(:write_first),
    do:
      {:conflict,
       "Write to the person you were just introduced to first. If a week goes by quietly, you can ask again."}

  defp refusal(:invalid_note), do: {:unprocessable_entity, "Keep your line under 200 characters."}
  defp refusal(_), do: {:forbidden, "The pen pal exchange isn't available for your account right now."}

  defp render_status(user) do
    status = PenPalExchange.status(user)

    %{
      state: status.state,
      can_join: status.can_join,
      reason: status.reason,
      note: status.note,
      waiting_since: status.waiting_since,
      rejoin_after_days: status.rejoin_after_days,
      introduction:
        case status.introduction do
          nil ->
            nil

          intro ->
            %{
              conversation_id: intro.conversation_id,
              introduced_at: intro.introduced_at,
              other_user: LetterJSON.user(intro.partner),
              written: intro.written,
              heard_back: intro.heard_back
            }
        end
    }
  end
end
