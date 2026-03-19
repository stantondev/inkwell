defmodule Inkwell.Moderation.FediverseBlocks do
  @moduledoc """
  Context module for fediverse blocking: individual remote actor blocks,
  user-level domain blocks, and admin instance-level domain defederation.
  """

  import Ecto.Query
  alias Inkwell.Repo
  alias Inkwell.Moderation.{BlockedRemoteActor, BlockedDomain}
  alias Inkwell.Federation.RemoteActorSchema

  require Logger

  # ── Individual Remote Actor Blocks ───────────────────────────────────────

  def block_remote_actor(user_id, remote_actor_id) do
    %BlockedRemoteActor{}
    |> BlockedRemoteActor.changeset(%{user_id: user_id, remote_actor_id: remote_actor_id})
    |> Repo.insert(on_conflict: :nothing)
    |> case do
      {:ok, block} ->
        cascade_block_remote_actor(user_id, remote_actor_id)
        {:ok, block}

      {:error, changeset} ->
        {:error, changeset}
    end
  end

  def unblock_remote_actor(user_id, remote_actor_id) do
    from(b in BlockedRemoteActor,
      where: b.user_id == ^user_id and b.remote_actor_id == ^remote_actor_id
    )
    |> Repo.delete_all()

    :ok
  end

  def list_blocked_remote_actors(user_id) do
    from(b in BlockedRemoteActor,
      where: b.user_id == ^user_id,
      join: ra in RemoteActorSchema,
      on: ra.id == b.remote_actor_id,
      select: %{
        id: b.id,
        remote_actor_id: ra.id,
        username: ra.username,
        domain: ra.domain,
        display_name: ra.display_name,
        avatar_url: ra.avatar_url,
        ap_id: ra.ap_id,
        blocked_at: b.inserted_at
      },
      order_by: [desc: b.inserted_at]
    )
    |> Repo.all()
  end

  def is_remote_actor_blocked?(user_id, remote_actor_id) do
    Repo.exists?(
      from(b in BlockedRemoteActor,
        where: b.user_id == ^user_id and b.remote_actor_id == ^remote_actor_id
      )
    )
  end

  def get_blocked_remote_actor_ids(user_id) do
    from(b in BlockedRemoteActor,
      where: b.user_id == ^user_id,
      select: b.remote_actor_id
    )
    |> Repo.all()
  end

  # ── User-Level Domain Blocks ─────────────────────────────────────────────

  def block_domain(user_id, domain, reason \\ nil) do
    %BlockedDomain{}
    |> BlockedDomain.changeset(%{user_id: user_id, domain: domain, reason: reason})
    |> Repo.insert(on_conflict: :nothing)
  end

  def unblock_domain(user_id, domain) do
    domain = String.downcase(String.trim(domain))

    from(b in BlockedDomain,
      where: b.user_id == ^user_id and b.domain == ^domain and b.blocked_by_admin == false
    )
    |> Repo.delete_all()

    :ok
  end

  def list_blocked_domains(user_id) do
    from(b in BlockedDomain,
      where: b.user_id == ^user_id and b.blocked_by_admin == false,
      order_by: [desc: b.inserted_at]
    )
    |> Repo.all()
  end

  def is_domain_blocked_by_user?(user_id, domain) do
    domain = String.downcase(domain)

    Repo.exists?(
      from(b in BlockedDomain,
        where: b.user_id == ^user_id and b.domain == ^domain and b.blocked_by_admin == false
      )
    )
  end

  def get_blocked_domains_for_user(user_id) do
    from(b in BlockedDomain,
      where: b.user_id == ^user_id and b.blocked_by_admin == false,
      select: b.domain
    )
    |> Repo.all()
  end

  # ── Admin Instance-Level Domain Blocks (Defederation) ────────────────────

  def admin_block_domain(domain, reason \\ nil) do
    %BlockedDomain{}
    |> BlockedDomain.admin_changeset(%{domain: domain, reason: reason})
    |> Repo.insert(on_conflict: :nothing)
  end

  def admin_unblock_domain(domain) do
    domain = String.downcase(String.trim(domain))

    from(b in BlockedDomain,
      where: b.domain == ^domain and b.blocked_by_admin == true
    )
    |> Repo.delete_all()

    :ok
  end

  def list_admin_blocked_domains do
    from(b in BlockedDomain,
      where: b.blocked_by_admin == true,
      order_by: [desc: b.inserted_at]
    )
    |> Repo.all()
  end

  def is_domain_defederated?(domain) when is_binary(domain) do
    domain = String.downcase(domain)

    Repo.exists?(
      from(b in BlockedDomain,
        where: b.domain == ^domain and b.blocked_by_admin == true
      )
    )
  end

  def is_domain_defederated?(_), do: false

  # ── Combined Check (Federation Controller) ──────────────────────────────

  @doc """
  Checks whether an inbound activity from a remote actor should be rejected.
  Checks in order: admin defederation, user remote actor block, user domain block.
  When user_id is nil (shared inbox), only checks admin defederation.
  """
  def should_reject_actor?(nil, _remote_actor_id, domain) do
    is_domain_defederated?(domain)
  end

  def should_reject_actor?(user_id, remote_actor_id, domain) do
    is_domain_defederated?(domain) ||
      is_remote_actor_blocked?(user_id, remote_actor_id) ||
      is_domain_blocked_by_user?(user_id, domain)
  end

  @doc """
  Returns a combined list of blocked remote actor IDs and domains for a user.
  Used for display filtering in feed/explore controllers.
  """
  def get_all_blocks_for_user(user_id) do
    blocked_actor_ids = get_blocked_remote_actor_ids(user_id)
    blocked_domains = get_blocked_domains_for_user(user_id)
    admin_domains = from(b in BlockedDomain, where: b.blocked_by_admin == true, select: b.domain) |> Repo.all()

    %{
      blocked_remote_actor_ids: blocked_actor_ids,
      blocked_domains: Enum.uniq(blocked_domains ++ admin_domains)
    }
  end

  # ── Cascade Cleanup ─────────────────────────────────────────────────────

  defp cascade_block_remote_actor(user_id, remote_actor_id) do
    # Delete federated inks from this actor on the user's entries
    from(i in Inkwell.Inks.Ink,
      where: i.remote_actor_id == ^remote_actor_id,
      join: e in Inkwell.Journals.Entry, on: i.entry_id == e.id,
      where: e.user_id == ^user_id
    )
    |> Repo.delete_all()

    # Delete federated reprints from this actor on the user's entries
    from(r in Inkwell.Reprints.Reprint,
      where: r.remote_actor_id == ^remote_actor_id,
      join: e in Inkwell.Journals.Entry, on: r.entry_id == e.id,
      where: e.user_id == ^user_id
    )
    |> Repo.delete_all()

    # Delete federated comments from this actor on the user's entries
    from(c in Inkwell.Journals.Comment,
      where: not is_nil(c.remote_author),
      join: e in Inkwell.Journals.Entry, on: c.entry_id == e.id,
      where: e.user_id == ^user_id
    )
    |> Repo.all()
    |> Enum.filter(fn c ->
      case c.remote_author do
        %{"ap_id" => ap_id} ->
          actor = Repo.get_by(RemoteActorSchema, ap_id: ap_id)
          actor && actor.id == remote_actor_id
        _ -> false
      end
    end)
    |> Enum.each(&Repo.delete/1)

    Logger.info("Cascaded block cleanup for remote actor #{remote_actor_id} on user #{user_id}")
  end
end
