defmodule InkwellWeb.ReadController do
  @moduledoc "Reader stats: count a read (public) and show a writer their numbers."

  use InkwellWeb, :controller

  alias Inkwell.{Journals, Reads, SelfHosted}

  @allowed_days [7, 30, 90, 365]

  # POST /api/entries/:entry_id/read  (optional auth)
  # Always 204: whether it counted is nobody's business but the stats.
  def create(conn, %{"entry_id" => entry_id} = params) do
    viewer = conn.assigns[:current_user]

    with {:ok, _} <- Ecto.UUID.cast(entry_id),
         %{} = entry <- Journals.get_entry(entry_id),
         true <- Journals.viewable_by?(entry, viewer) do
      Reads.record(
        entry,
        viewer,
        InkwellWeb.Plugs.RateLimit.client_ip(conn),
        conn |> get_req_header("user-agent") |> List.first(),
        params["referrer"]
      )
    end

    send_resp(conn, 204, "")
  end

  # GET /api/me/reads?days=30
  # Everyone sees their totals; the day-by-day chart, top entries and where
  # readers came from are part of Plus.
  def summary(conn, params) do
    user = conn.assigns.current_user
    days = parse_days(params["days"])
    plus? = SelfHosted.effective_tier(user) == "plus"

    data =
      user.id
      |> Reads.writer_summary(days, detail: plus?)
      |> Map.put(:plus, plus?)

    json(conn, %{data: data})
  end

  defp parse_days(value) do
    case Integer.parse(to_string(value || "30")) do
      {n, _} when n in @allowed_days -> n
      _ -> 30
    end
  end
end
