defmodule InkwellWeb.PollController do
  use InkwellWeb, :controller

  alias Inkwell.Polls
  alias Inkwell.Journals

  # ── Public (optional auth) ─────────────────────────────────────────────────

  def index(conn, params) do
    viewer = conn.assigns[:current_user]
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)
    status = params["status"]

    {polls, total} = Polls.list_platform_polls(%{page: page, per_page: per_page, status: status})

    viewer_id = if viewer, do: viewer.id, else: nil
    poll_ids = Enum.map(polls, & &1.id)
    user_votes = Polls.get_user_votes_for_polls(viewer_id, poll_ids)

    rendered =
      Enum.map(polls, fn poll ->
        render_poll(poll, Map.get(user_votes, poll.id))
      end)

    json(conn, %{
      data: rendered,
      pagination: %{
        page: page,
        per_page: per_page,
        total: total,
        total_pages: ceil(total / per_page)
      }
    })
  end

  def active_widget(conn, _params) do
    viewer = conn.assigns[:current_user]

    case Polls.get_active_platform_poll() do
      nil ->
        json(conn, %{data: nil})

      poll ->
        viewer_id = if viewer, do: viewer.id, else: nil
        my_vote = Polls.get_user_vote(viewer_id, poll.id)
        json(conn, %{data: render_poll(poll, my_vote)})
    end
  end

  def show(conn, %{"id" => id}) do
    viewer = conn.assigns[:current_user]

    case Polls.get_poll(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Poll not found"})

      poll ->
        viewer_id = if viewer, do: viewer.id, else: nil
        my_vote = Polls.get_user_vote(viewer_id, poll.id)
        json(conn, %{data: render_poll(poll, my_vote)})
    end
  end

  # ── Authenticated ──────────────────────────────────────────────────────────

  def vote(conn, %{"id" => poll_id, "option_id" => option_id}) do
    user = conn.assigns.current_user

    case Polls.vote(user.id, poll_id, option_id) do
      {:ok, _vote} ->
        poll = Polls.get_poll(poll_id)
        my_vote = Polls.get_user_vote(user.id, poll_id)
        json(conn, %{data: render_poll(poll, my_vote)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Poll not found"})

      {:error, :poll_closed} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "This poll is closed"})

      {:error, :invalid_option} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Invalid option"})

      {:error, changeset} ->
        if has_unique_error?(changeset) do
          conn |> put_status(:conflict) |> json(%{error: "You have already voted on this poll"})
        else
          conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
        end
    end
  end

  def vote(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "option_id is required"})
  end

  def create_entry_poll(conn, %{"entry_id" => entry_id} = params) do
    user = conn.assigns.current_user

    if user.subscription_tier != "plus" do
      conn |> put_status(:forbidden) |> json(%{error: "Entry polls require a Plus subscription"})
    else
      case Journals.get_entry(entry_id) do
        nil ->
          conn |> put_status(:not_found) |> json(%{error: "Entry not found"})

        entry ->
          if entry.user_id != user.id do
            conn |> put_status(:forbidden) |> json(%{error: "You can only add polls to your own entries"})
          else
            # Check if entry already has a poll
            case Polls.get_poll_for_entry(entry_id) do
              nil ->
                options = params["options"] || []

                attrs = %{
                  question: params["question"],
                  type: :entry,
                  creator_id: user.id,
                  entry_id: entry_id,
                  closes_at: parse_datetime(params["closes_at"])
                }

                case Polls.create_poll(attrs, options) do
                  {:ok, poll} ->
                    poll = Polls.get_poll(poll.id)
                    conn |> put_status(:created) |> json(%{data: render_poll(poll, nil)})

                  {:error, :too_few_options} ->
                    conn |> put_status(:unprocessable_entity) |> json(%{error: "At least 2 options are required"})

                  {:error, :too_many_options} ->
                    conn |> put_status(:unprocessable_entity) |> json(%{error: "Maximum 10 options allowed"})

                  {:error, :blank_option} ->
                    conn |> put_status(:unprocessable_entity) |> json(%{error: "Options cannot be blank"})

                  {:error, changeset} ->
                    conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
                end

              _existing ->
                conn |> put_status(:conflict) |> json(%{error: "This entry already has a poll"})
            end
          end
      end
    end
  end

  def update_entry_poll(conn, %{"id" => poll_id} = params) do
    user = conn.assigns.current_user

    case Polls.get_poll(poll_id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Poll not found"})

      poll ->
        if poll.creator_id != user.id do
          conn |> put_status(:forbidden) |> json(%{error: "You can only edit your own polls"})
        else
          options = params["options"] || []

          attrs = %{
            question: params["question"],
            closes_at: parse_datetime(params["closes_at"])
          }

          case Polls.update_poll(poll, attrs, options) do
            {:ok, updated} ->
              json(conn, %{data: render_poll(updated, nil)})

            {:error, :poll_has_votes} ->
              conn |> put_status(:conflict) |> json(%{error: "Cannot edit a poll after votes have been cast"})

            {:error, :too_few_options} ->
              conn |> put_status(:unprocessable_entity) |> json(%{error: "At least 2 options are required"})

            {:error, :too_many_options} ->
              conn |> put_status(:unprocessable_entity) |> json(%{error: "Maximum 10 options allowed"})

            {:error, :blank_option} ->
              conn |> put_status(:unprocessable_entity) |> json(%{error: "Options cannot be blank"})

            {:error, changeset} ->
              conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
          end
      end
    end
  end

  # ── Admin ──────────────────────────────────────────────────────────────────

  def admin_index(conn, params) do
    page = parse_int(params["page"], 1)
    per_page = parse_int(params["per_page"], 20)

    {polls, total} = Polls.list_all_polls(%{page: page, per_page: per_page})

    rendered = Enum.map(polls, fn poll -> render_poll(poll, nil) end)

    json(conn, %{
      data: rendered,
      pagination: %{
        page: page,
        per_page: per_page,
        total: total,
        total_pages: ceil(total / per_page)
      }
    })
  end

  def create_platform(conn, params) do
    user = conn.assigns.current_user
    options = params["options"] || []

    attrs = %{
      question: params["question"],
      type: :platform,
      creator_id: user.id,
      closes_at: parse_datetime(params["closes_at"])
    }

    case Polls.create_poll(attrs, options) do
      {:ok, poll} ->
        poll = Polls.get_poll(poll.id)
        conn |> put_status(:created) |> json(%{data: render_poll(poll, nil)})

      {:error, :too_few_options} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "At least 2 options are required"})

      {:error, :too_many_options} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Maximum 10 options allowed"})

      {:error, :blank_option} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Options cannot be blank"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
    end
  end

  def close(conn, %{"id" => id}) do
    case Polls.get_poll(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Poll not found"})

      poll ->
        case Polls.close_poll(poll) do
          {:ok, poll} ->
            poll = Polls.get_poll(poll.id)
            json(conn, %{data: render_poll(poll, nil)})

          {:error, changeset} ->
            conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
        end
    end
  end

  def delete(conn, %{"id" => id}) do
    case Polls.get_poll(id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Poll not found"})

      poll ->
        case Polls.delete_poll(poll) do
          {:ok, _} -> conn |> put_status(:no_content) |> json(%{})
          {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to delete poll"})
        end
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────────────

  def render_poll(poll, viewer_vote) do
    is_open =
      poll.status == :open and
        (is_nil(poll.closes_at) or DateTime.compare(poll.closes_at, DateTime.utc_now()) == :gt)

    options =
      Enum.map(poll.options, fn opt ->
        %{
          id: opt.id,
          label: opt.label,
          position: opt.position,
          vote_count: opt.vote_count,
          percentage:
            if(poll.total_votes > 0,
              do: round(opt.vote_count / poll.total_votes * 100),
              else: 0
            )
        }
      end)

    creator =
      if poll.creator do
        %{
          id: poll.creator.id,
          username: poll.creator.username,
          display_name: poll.creator.display_name,
          avatar_url: poll.creator.avatar_url
        }
      else
        %{id: nil, username: "[deleted]", display_name: "[Deleted User]", avatar_url: nil}
      end

    %{
      id: poll.id,
      question: poll.question,
      type: poll.type,
      status: if(is_open, do: :open, else: :closed),
      max_choices: poll.max_choices,
      closes_at: poll.closes_at,
      closed_at: poll.closed_at,
      total_votes: poll.total_votes,
      options: options,
      my_vote: viewer_vote,
      creator: creator,
      entry_id: poll.entry_id,
      created_at: poll.inserted_at
    }
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 1)
      :error -> default
    end
  end
  defp parse_int(val, _default) when is_integer(val), do: max(val, 1)

  defp parse_datetime(nil), do: nil
  defp parse_datetime(""), do: nil
  defp parse_datetime(str) when is_binary(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _} -> DateTime.truncate(dt, :microsecond)
      _ -> nil
    end
  end

  defp format_errors(%Ecto.Changeset{} = changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
  defp format_errors(_), do: %{}

  defp has_unique_error?(%Ecto.Changeset{errors: errors}) do
    Enum.any?(errors, fn {_field, {_msg, opts}} ->
      Keyword.get(opts, :constraint) == :unique
    end)
  end
  defp has_unique_error?(_), do: false
end
