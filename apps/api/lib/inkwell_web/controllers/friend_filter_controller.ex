defmodule InkwellWeb.FriendFilterController do
  use InkwellWeb, :controller

  alias Inkwell.Social
  alias Inkwell.Journals

  @free_filter_limit 5

  def index(conn, _params) do
    filters = Social.list_friend_filters(conn.assigns.current_user.id)
    json(conn, %{data: Enum.map(filters, &render_filter_with_count/1)})
  end

  def create(conn, params) do
    user = conn.assigns.current_user

    if (user.subscription_tier || "free") != "plus" do
      current_count = length(Social.list_friend_filters(user.id))
      if current_count >= @free_filter_limit do
        conn |> put_status(:unprocessable_entity) |> json(%{error: "filter_limit_reached"})
      else
        do_create(conn, user, params)
      end
    else
      do_create(conn, user, params)
    end
  end

  defp do_create(conn, user, params) do
    attrs = Map.merge(
      Map.take(params, ["name", "member_ids"]),
      %{"user_id" => user.id}
    )

    case Social.create_friend_filter(attrs) do
      {:ok, filter} ->
        conn |> put_status(:created) |> json(%{data: render_filter(filter)})
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user
    filters = Social.list_friend_filters(user.id)

    case Enum.find(filters, &(&1.id == id)) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Filter not found"})
      filter ->
        attrs = Map.take(params, ["name", "member_ids"])
        case Social.update_friend_filter(filter, attrs) do
          {:ok, updated} -> json(conn, %{data: render_filter(updated)})
          {:error, changeset} ->
            conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
        end
    end
  end

  def delete(conn, %{"id" => id}) do
    user = conn.assigns.current_user
    filters = Social.list_friend_filters(user.id)

    case Enum.find(filters, &(&1.id == id)) do
      nil -> conn |> put_status(:not_found) |> json(%{error: "Filter not found"})
      filter ->
        {:ok, _} = Social.delete_friend_filter(filter)
        send_resp(conn, :no_content, "")
    end
  end

  defp render_filter(filter) do
    %{
      id: filter.id,
      user_id: filter.user_id,
      name: filter.name,
      member_ids: filter.member_ids,
      created_at: filter.inserted_at
    }
  end

  defp render_filter_with_count(filter) do
    filter
    |> render_filter()
    |> Map.put(:entry_count, Journals.count_entries_using_filter(filter.id))
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
