defmodule InkwellWeb.WriterSubscriptionController do
  use InkwellWeb, :controller

  alias Inkwell.{Accounts, WriterSubscriptions}

  # GET /api/writer-plans/by-writer/:username — public/optional-auth
  def get_writer_plan(conn, %{"username" => username}) do
    case Accounts.get_user_by_username(username) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "User not found"})

      user ->
        case WriterSubscriptions.get_active_plan_for_writer(user.id) do
          nil ->
            json(conn, %{data: nil})

          plan ->
            viewer = conn.assigns[:current_user]
            is_subscribed = viewer && WriterSubscriptions.is_subscribed?(viewer.id, user.id)

            json(conn, %{data: %{
              id: plan.id,
              name: plan.name,
              description: plan.description,
              price_cents: plan.price_cents,
              subscriber_count: plan.subscriber_count,
              writer_id: plan.writer_id,
              is_subscribed: is_subscribed || false
            }})
        end
    end
  end

  # GET /api/writer-plans/mine — auth
  def get_my_plan(conn, _params) do
    user = conn.assigns.current_user

    case WriterSubscriptions.get_active_plan_for_writer(user.id) do
      nil ->
        json(conn, %{data: nil})

      plan ->
        json(conn, %{data: render_plan(plan)})
    end
  end

  # POST /api/writer-plans — auth
  def create_plan(conn, params) do
    user = conn.assigns.current_user

    case WriterSubscriptions.create_plan(user, params) do
      {:ok, plan} ->
        conn |> put_status(:created) |> json(%{data: render_plan(plan)})

      {:error, :requires_plus} ->
        conn |> put_status(:forbidden) |> json(%{error: "Plus subscription required"})

      {:error, :requires_connect} ->
        conn |> put_status(:forbidden) |> json(%{error: "Stripe Connect must be enabled"})

      {:error, :plan_already_exists} ->
        conn |> put_status(:conflict) |> json(%{error: "You already have an active plan"})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})

      {:error, reason} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Failed to create plan: #{inspect(reason)}"})
    end
  end

  # PATCH /api/writer-plans/:id — auth
  def update_plan(conn, %{"id" => id} = params) do
    user = conn.assigns.current_user

    case WriterSubscriptions.update_plan(user, id, params) do
      {:ok, plan} ->
        json(conn, %{data: render_plan(plan)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Plan not found"})

      {:error, :not_owner} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your plan"})

      {:error, %Ecto.Changeset{} = changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
    end
  end

  # DELETE /api/writer-plans/:id — auth
  def archive_plan(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case WriterSubscriptions.archive_plan(user, id) do
      {:ok, plan} ->
        json(conn, %{data: render_plan(plan)})

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Plan not found"})

      {:error, :not_owner} ->
        conn |> put_status(:forbidden) |> json(%{error: "Not your plan"})

      {:error, :already_archived} ->
        conn |> put_status(:conflict) |> json(%{error: "Plan is already archived"})
    end
  end

  # POST /api/writer-plans/:id/checkout — auth
  def create_checkout(conn, %{"id" => id}) do
    user = conn.assigns.current_user

    case WriterSubscriptions.create_checkout_session(user, id) do
      {:ok, %{url: url, session_id: session_id}} ->
        json(conn, %{url: url, session_id: session_id})

      {:error, :plan_not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "Plan not found"})

      {:error, :plan_archived} ->
        conn |> put_status(:gone) |> json(%{error: "This plan is no longer available"})

      {:error, :cannot_subscribe_self} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Cannot subscribe to your own plan"})

      {:error, :already_subscribed} ->
        conn |> put_status(:conflict) |> json(%{error: "Already subscribed"})

      {:error, :writer_not_connected} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Writer's payment setup is incomplete"})

      {:error, reason} ->
        conn |> put_status(:internal_server_error) |> json(%{error: "Checkout failed: #{inspect(reason)}"})
    end
  end

  # DELETE /api/writer-plans/subscriptions/:writer_id — auth
  def cancel_subscription(conn, %{"writer_id" => writer_id}) do
    user = conn.assigns.current_user

    case WriterSubscriptions.cancel_subscription(user, writer_id) do
      {:ok, :canceled} ->
        json(conn, %{ok: true})

      {:error, :not_subscribed} ->
        conn |> put_status(:not_found) |> json(%{error: "No active subscription found"})
    end
  end

  # GET /api/writer-plans/subscriptions — auth (my active subscriptions as a reader)
  def my_subscriptions(conn, _params) do
    user = conn.assigns.current_user

    writer_ids = WriterSubscriptions.get_subscribed_writer_ids(user.id)

    subs =
      Enum.map(writer_ids, fn writer_id ->
        writer = Accounts.get_user!(writer_id)
        plan = WriterSubscriptions.get_active_plan_for_writer(writer_id)

        %{
          writer: %{
            id: writer.id,
            username: writer.username,
            display_name: writer.display_name,
            avatar_url: writer.avatar_url,
            avatar_frame: writer.avatar_frame
          },
          plan: if(plan, do: %{
            id: plan.id,
            name: plan.name,
            price_cents: plan.price_cents
          }, else: nil)
        }
      end)

    json(conn, %{data: subs})
  end

  # GET /api/writer-plans/subscribers — auth (my subscribers as a writer)
  def list_subscribers(conn, params) do
    user = conn.assigns.current_user
    offset = parse_int(params["offset"], 0)
    limit = parse_int(params["limit"], 20)

    subs = WriterSubscriptions.list_subscribers(user.id, limit: limit, offset: offset)

    data =
      Enum.map(subs, fn sub ->
        subscriber = sub.subscriber

        %{
          id: sub.id,
          subscribed_at: sub.inserted_at,
          subscriber: %{
            id: subscriber.id,
            username: subscriber.username,
            display_name: subscriber.display_name,
            avatar_url: subscriber.avatar_url,
            avatar_frame: subscriber.avatar_frame
          }
        }
      end)

    json(conn, %{data: data})
  end

  # GET /api/writer-plans/stats — auth
  def stats(conn, _params) do
    user = conn.assigns.current_user
    stats = WriterSubscriptions.get_stats(user.id)
    json(conn, %{data: stats})
  end

  # GET /api/writer-plans/check/:writer_id — auth
  def check_subscription(conn, %{"writer_id" => writer_id}) do
    user = conn.assigns.current_user
    result = WriterSubscriptions.check_subscription(user.id, writer_id)
    json(conn, %{data: result})
  end

  # ── Helpers ──────────────────────────────────────────────────────────

  defp render_plan(plan) do
    %{
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price_cents: plan.price_cents,
      currency: plan.currency,
      status: plan.status,
      subscriber_count: plan.subscriber_count,
      total_earned_cents: plan.total_earned_cents,
      inserted_at: plan.inserted_at,
      updated_at: plan.updated_at
    }
  end

  defp format_errors(%Ecto.Changeset{} = changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> max(n, 0)
      :error -> default
    end
  end
  defp parse_int(val, _) when is_integer(val), do: val
end
