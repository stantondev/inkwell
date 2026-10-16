defmodule InkwellWeb.ProfileHomeController do
  @moduledoc """
  Saves the arrangement of the signed-in writer's profile page
  (Inkwell.ProfileHome), from the Arrange my page editor. Free for everyone.
  """
  use InkwellWeb, :controller

  alias Inkwell.{ProfileHome, Repo}
  alias Inkwell.Accounts.User

  # Well above any real page (80 blocks of notes at 2,000 characters is
  # ~200 KB of text, so this also caps how much prose a page can hold).
  @max_bytes 300_000

  # PUT /api/me/home  {"home": {...}}
  def update(conn, %{"home" => home}) when is_map(home) do
    user = conn.assigns.current_user

    with :ok <- check_size(home),
         # Plus sticker packs are kept only for Plus members (Inkwell.ProfileHome).
         plus? = Inkwell.SelfHosted.effective_tier(user) == "plus",
         {:ok, clean} <- ProfileHome.normalize(home, owner_id: user.id, plus: plus?),
         {:ok, updated} <- user |> User.home_changeset(clean) |> Repo.update() do
      # A new account's page gets the same spam check as its bio and first posts.
      if Inkwell.Moderation.RequestGate.new_account?(updated),
        do: Inkwell.Workers.AutoModerationWorker.enqueue_user(updated.id)

      json(conn, %{data: ProfileHome.for_user(updated)})
    else
      {:error, :too_large} ->
        conn |> put_status(:request_entity_too_large) |> json(%{error: "That page is too big to save."})

      {:error, %Ecto.Changeset{}} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Couldn't save your page."})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "That isn't a page arrangement."})
    end
  end

  def update(conn, _params) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "Send the page as {\"home\": {...}}."})
  end

  defp check_size(home) do
    if byte_size(Jason.encode!(home)) > @max_bytes, do: {:error, :too_large}, else: :ok
  end
end
