defmodule Inkwell.CustomDomains do
  @moduledoc """
  Context for managing custom domains for Plus users.
  Custom domains let Plus subscribers serve their profile at their own domain.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.CustomDomains.CustomDomain

  # ── Public API ──

  def get_domain_by_user(user_id) do
    Repo.get_by(CustomDomain, user_id: user_id)
  end

  def get_domain_by_hostname(hostname) do
    hostname = normalize(hostname)
    Repo.get_by(CustomDomain, domain: hostname)
    |> Repo.preload(:user)
  end

  def get_active_domain_by_hostname(hostname) do
    hostname = normalize(hostname)

    from(cd in CustomDomain,
      where: cd.domain == ^hostname and cd.status == "active",
      preload: [:user]
    )
    |> Repo.one()
  end

  @doc """
  Resolves a hostname to a username. Used by the Next.js middleware
  to map custom domain requests to the correct user's profile.
  Returns %{username: string, user_id: string} or nil.
  """
  def resolve_hostname(hostname) do
    hostname = normalize(hostname)

    from(cd in CustomDomain,
      where: cd.domain == ^hostname and cd.status == "active",
      join: u in assoc(cd, :user),
      select: %{username: u.username, user_id: u.id}
    )
    |> Repo.one()
  end

  def create_domain(user_id, domain) do
    domain = normalize(domain)

    %CustomDomain{}
    |> CustomDomain.changeset(%{user_id: user_id, domain: domain})
    |> Repo.insert()
  end

  def update_status(custom_domain, status, extra_attrs \\ %{}) do
    attrs = Map.merge(%{status: status, last_check_at: DateTime.utc_now()}, extra_attrs)

    custom_domain
    |> Ecto.Changeset.change(attrs)
    |> Repo.update()
  end

  def remove_domain(custom_domain) do
    Repo.delete(custom_domain)
  end

  @doc "Reactivate a previously removed domain (e.g., when user re-subscribes to Plus)."
  def reactivate_domain(custom_domain) do
    update_status(custom_domain, "pending_dns", %{
      dns_verified_at: nil,
      cert_issued_at: nil,
      error_message: nil
    })
  end

  @doc "List domains waiting for DNS verification (with 5-minute cooldown between checks)."
  def list_domains_needing_dns_check do
    cutoff = DateTime.add(DateTime.utc_now(), -300, :second)

    from(cd in CustomDomain,
      where: cd.status == "pending_dns",
      where: is_nil(cd.last_check_at) or cd.last_check_at < ^cutoff
    )
    |> Repo.all()
  end

  @doc "List domains waiting for certificate issuance (with 2-minute cooldown between checks)."
  def list_domains_needing_cert_check do
    cutoff = DateTime.add(DateTime.utc_now(), -120, :second)

    from(cd in CustomDomain,
      where: cd.status == "pending_cert",
      where: is_nil(cd.last_check_at) or cd.last_check_at < ^cutoff
    )
    |> Repo.all()
  end

  # ── Helpers ──

  defp normalize(domain) do
    domain
    |> String.trim()
    |> String.downcase()
    |> String.trim_trailing(".")
  end
end
