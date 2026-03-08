defmodule Inkwell.Workers.CustomDomainCheckWorker do
  @moduledoc """
  Oban cron worker that processes custom domains needing DNS verification
  and certificate issuance. Runs every 5 minutes.

  Also handles on-demand checks when a user clicks "Check DNS" in settings
  (receives a domain_id arg).
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.CustomDomains
  alias Inkwell.CustomDomains.CustomDomain
  alias Inkwell.FlyCerts
  alias Inkwell.Repo

  require Logger

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"domain_id" => id}}) do
    case Repo.get(CustomDomain, id) do
      nil -> :ok
      domain -> process_domain(domain)
    end
  end

  # Cron entry: processes all pending domains
  def perform(%Oban.Job{args: _}) do
    # Phase 1: Check DNS for pending_dns domains
    for domain <- CustomDomains.list_domains_needing_dns_check() do
      check_dns(domain)
    end

    # Phase 2: Check cert status for pending_cert domains
    for domain <- CustomDomains.list_domains_needing_cert_check() do
      check_cert(domain)
    end

    :ok
  end

  # ── Domain processing ──

  defp process_domain(%{status: "pending_dns"} = domain), do: check_dns(domain)
  defp process_domain(%{status: "pending_cert"} = domain), do: check_cert(domain)
  defp process_domain(_), do: :ok

  defp check_dns(domain) do
    case resolve_domain(domain.domain) do
      {:ok, _} ->
        Logger.info("[CustomDomain] DNS verified for #{domain.domain} — requesting certificate")

        case FlyCerts.request_certificate(domain.domain) do
          {:ok, _} ->
            CustomDomains.update_status(domain, "pending_cert", %{
              dns_verified_at: DateTime.utc_now(),
              error_message: nil
            })

          {:error, :fly_not_configured} ->
            Logger.warning("[CustomDomain] FLY_API_TOKEN not set — cannot request cert for #{domain.domain}")
            CustomDomains.update_status(domain, "pending_dns", %{
              error_message: "Certificate service not configured"
            })

          {:error, reason} ->
            Logger.warning("[CustomDomain] Cert request failed for #{domain.domain}: #{inspect(reason)}")
            CustomDomains.update_status(domain, "pending_dns", %{
              error_message: "Certificate request failed — will retry automatically"
            })
        end

      {:error, _reason} ->
        Logger.debug("[CustomDomain] DNS not configured for #{domain.domain}")
        CustomDomains.update_status(domain, "pending_dns", %{})
    end
  end

  defp check_cert(domain) do
    case FlyCerts.check_certificate(domain.domain) do
      {:ok, %{"configured" => true}} ->
        Logger.info("[CustomDomain] Certificate issued for #{domain.domain}")

        CustomDomains.update_status(domain, "active", %{
          cert_issued_at: DateTime.utc_now(),
          error_message: nil
        })

        Inkwell.Slack.notify("Custom domain `#{domain.domain}` is now active :globe_with_meridians:")

      {:ok, _} ->
        # Not yet configured — just update last_check_at
        CustomDomains.update_status(domain, "pending_cert", %{})

      {:error, :fly_not_configured} ->
        Logger.warning("[CustomDomain] FLY_API_TOKEN not set — cannot check cert for #{domain.domain}")

      {:error, reason} ->
        Logger.warning("[CustomDomain] Cert check failed for #{domain.domain}: #{inspect(reason)}")
        CustomDomains.update_status(domain, "pending_cert", %{
          error_message: "Certificate check failed — will retry automatically"
        })
    end
  end

  # ── DNS Resolution ──

  defp resolve_domain(domain) do
    domain_charlist = String.to_charlist(domain)

    # Try A record first
    case :inet_res.getbyname(domain_charlist, :a) do
      {:ok, {:hostent, _, _, _, _, ips}} when ips != [] ->
        {:ok, ips}

      _ ->
        # Fall back to AAAA
        case :inet_res.getbyname(domain_charlist, :aaaa) do
          {:ok, {:hostent, _, _, _, _, ips}} when ips != [] ->
            {:ok, ips}

          _ ->
            # Try CNAME resolution (domain might CNAME to fly.dev which resolves)
            case :inet_res.getbyname(domain_charlist, :cname) do
              {:ok, _} -> {:ok, :cname_resolved}
              _ -> {:error, :dns_not_configured}
            end
        end
    end
  end
end
