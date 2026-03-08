defmodule InkwellWeb.CustomDomainController do
  use InkwellWeb, :controller

  alias Inkwell.CustomDomains

  @doc "GET /api/custom-domain/resolve?hostname=X — public, called by Next.js middleware."
  def resolve(conn, %{"hostname" => hostname}) do
    case CustomDomains.resolve_hostname(hostname) do
      nil -> json(conn, %{found: false})
      %{username: username} -> json(conn, %{found: true, username: username})
    end
  end

  def resolve(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "hostname parameter required"})
  end

  @doc "GET /api/custom-domain — authenticated, returns current user's domain config."
  def show(conn, _params) do
    user = conn.assigns.current_user

    case CustomDomains.get_domain_by_user(user.id) do
      nil -> json(conn, %{data: nil})
      domain -> json(conn, %{data: render_domain(domain)})
    end
  end

  @doc "POST /api/custom-domain — authenticated, Plus-only, creates a custom domain."
  def create(conn, %{"domain" => domain}) do
    user = conn.assigns.current_user

    if (user.subscription_tier || "free") != "plus" do
      conn |> put_status(:forbidden) |> json(%{error: "Custom domains require a Plus subscription"})
    else
      # Check if user already has a removed domain they can reactivate
      case CustomDomains.get_domain_by_user(user.id) do
        %{status: "removed"} = existing ->
          if String.downcase(String.trim(domain)) == existing.domain do
            case CustomDomains.reactivate_domain(existing) do
              {:ok, cd} -> conn |> put_status(:ok) |> json(%{data: render_domain(cd)})
              {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Failed to reactivate domain"})
            end
          else
            # Different domain — remove old one and create new
            CustomDomains.remove_domain(existing)
            do_create(conn, user.id, domain)
          end

        %{} ->
          conn |> put_status(:conflict) |> json(%{error: "You already have a custom domain configured. Remove it first to set up a new one."})

        nil ->
          do_create(conn, user.id, domain)
      end
    end
  end

  def create(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "domain parameter required"})
  end

  @doc "POST /api/custom-domain/check — authenticated, triggers immediate DNS check."
  def check(conn, _params) do
    user = conn.assigns.current_user

    case CustomDomains.get_domain_by_user(user.id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "No domain configured"})

      domain ->
        Inkwell.Workers.CustomDomainCheckWorker.new(%{"domain_id" => domain.id})
        |> Oban.insert()

        json(conn, %{data: render_domain(domain), message: "DNS check queued"})
    end
  end

  @doc "DELETE /api/custom-domain — authenticated, removes custom domain."
  def delete(conn, _params) do
    user = conn.assigns.current_user

    case CustomDomains.get_domain_by_user(user.id) do
      nil ->
        json(conn, %{ok: true})

      domain ->
        # Clean up Fly certificate in background
        if domain.status in ["active", "pending_cert"] do
          Inkwell.Workers.CustomDomainCertWorker.new(%{
            "action" => "delete",
            "hostname" => domain.domain
          })
          |> Oban.insert()
        end

        CustomDomains.remove_domain(domain)
        json(conn, %{ok: true})
    end
  end

  # ── Helpers ──

  defp do_create(conn, user_id, domain) do
    case CustomDomains.create_domain(user_id, domain) do
      {:ok, cd} ->
        conn |> put_status(:created) |> json(%{data: render_domain(cd)})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: format_errors(changeset)})
    end
  end

  defp render_domain(cd) do
    %{
      id: cd.id,
      domain: cd.domain,
      status: cd.status,
      dns_verified_at: cd.dns_verified_at,
      cert_issued_at: cd.cert_issued_at,
      last_check_at: cd.last_check_at,
      error_message: cd.error_message,
      created_at: cd.inserted_at
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
