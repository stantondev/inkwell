defmodule Inkwell.Auth.LoginHandoff do
  @moduledoc """
  ETS-based ephemeral store for cross-context login handoffs.

  Someone asks for a sign-in link in one place (typically the installed app,
  which keeps its own cookies) and opens the email in another (Safari, or an
  email app's built-in browser). The first place polls `claim_handoff/1` and
  receives a session once the second place hands it over.

  Handing over is gated by a 4-digit code that is shown only on the screen
  that asked for the link. Before 2026-09-19 opening the link completed the
  handoff automatically, and the magic-link endpoint returns the handoff ID to
  whoever calls it, for any email address. So anyone could request a link
  for someone else's email, keep the ID, and receive that person's session
  the moment they clicked the unexpected email. Now the person opening the
  link must type the code from the other screen, which an attacker can't make
  them see.

  The same browser never needs this: opening the link there sets its cookie
  directly. A wrong code 5 times destroys the handoff.

  Entries live as long as the magic link itself (30 minutes). They used to
  expire after 5, so a link that was still perfectly valid could no longer be
  handed over — the person typed the right code and was told the request had
  expired.

  `mark_opened/1` records that the link was opened somewhere else, so the
  requesting screen can show its code exactly when it is needed instead of
  displaying a 4-digit number to everyone, most of whom never need it.
  """

  use GenServer

  @table :login_handoffs
  # Matches Inkwell.Auth's magic link TTL. Keep the two in step.
  @ttl_ms 30 * 60 * 1000
  @max_attempts 5

  # ── Public API ──────────────────────────────────────────────────────────────

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @doc "How long a handoff stays usable, in seconds."
  def ttl_seconds, do: div(@ttl_ms, 1000)

  @doc """
  Create a new handoff for `user_id`. Returns `{id, code}`; the code is only
  for the requesting screen.

  The account is recorded so a session can never be handed to a screen that
  asked to sign in as somebody else.
  """
  def create_handoff(user_id) do
    id =
      :crypto.strong_rand_bytes(16)
      |> Base.url_encode64(padding: false)

    code = generate_code()
    expiry = System.system_time(:millisecond) + @ttl_ms
    :ets.insert(@table, {id, code, 0, nil, nil, expiry, user_id, false})
    lazy_cleanup()
    {id, code}
  end

  @doc """
  Note that the emailed link has been opened somewhere other than the screen
  that asked for it, so that screen can surface its code. Always returns :ok —
  this is a display hint, never a gate.
  """
  def mark_opened(id) when is_binary(id) do
    now = System.system_time(:millisecond)

    case :ets.lookup(@table, id) do
      [{^id, code, attempts, token, user, expiry, user_id, _awaiting}] when expiry > now ->
        :ets.insert(@table, {id, code, attempts, token, user, expiry, user_id, true})
        :ok

      _ ->
        :ok
    end
  end

  def mark_opened(_id), do: :ok

  @doc """
  Hand a session over to the screen that requested the link, if `code`
  matches the one shown there and `user_id` is the account the link was for.
  Returns :ok, :wrong_code, :wrong_account, :expired or :not_found.
  """
  def complete_handoff(id, code, user_id, token, user_data)
      when is_binary(id) and is_binary(code) do
    now = System.system_time(:millisecond)

    case :ets.lookup(@table, id) do
      [{^id, _code, _attempts, _token, _user, expiry, _uid, _awaiting}] when expiry <= now ->
        :ets.delete(@table, id)
        :expired

      [{^id, _code, _attempts, _token, _user, _expiry, uid, _awaiting}]
      when not is_nil(uid) and uid != user_id ->
        # The link was for a different account than this browser is signed in
        # as. Never hand over a session the requesting screen didn't ask for.
        :wrong_account

      [{^id, stored_code, attempts, _token, _user, expiry, uid, awaiting}] ->
        if Plug.Crypto.secure_compare(stored_code, String.trim(code)) do
          :ets.insert(@table, {id, stored_code, attempts, token, user_data, expiry, uid, awaiting})
          :ok
        else
          if attempts + 1 >= @max_attempts do
            :ets.delete(@table, id)
            :expired
          else
            :ets.insert(@table, {id, stored_code, attempts + 1, nil, nil, expiry, uid, awaiting})
            :wrong_code
          end
        end

      [] ->
        :not_found
    end
  end

  def complete_handoff(_id, _code, _user_id, _token, _user_data), do: :not_found

  @doc """
  Claim a completed handoff. Returns `{:ok, token, user_data}`,
  `{:pending, awaiting_code?}`, or `:not_found`.
  """
  def claim_handoff(id) when is_binary(id) do
    now = System.system_time(:millisecond)

    case :ets.lookup(@table, id) do
      [{^id, _code, _attempts, nil, _user, expiry, _uid, awaiting}] when expiry > now ->
        {:pending, awaiting}

      [{^id, _code, _attempts, token, user_data, expiry, _uid, _awaiting}] when expiry > now ->
        :ets.delete(@table, id)
        {:ok, token, user_data}

      [{^id, _code, _attempts, _token, _user, _expiry, _uid, _awaiting}] ->
        :ets.delete(@table, id)
        :not_found

      [] ->
        :not_found
    end
  end

  def claim_handoff(_id), do: :not_found

  # ── GenServer callbacks ─────────────────────────────────────────────────────

  @impl true
  def init([]) do
    :ets.new(@table, [:set, :public, :named_table])
    {:ok, %{}}
  end

  # ── Private ─────────────────────────────────────────────────────────────────

  defp generate_code do
    :crypto.strong_rand_bytes(4)
    |> :binary.decode_unsigned()
    |> rem(10_000)
    |> Integer.to_string()
    |> String.pad_leading(4, "0")
  end

  defp lazy_cleanup do
    now = System.system_time(:millisecond)

    :ets.select_delete(@table, [
      {{:"$1", :"$2", :"$3", :"$4", :"$5", :"$6", :"$7", :"$8"}, [{:<, :"$6", now}], [true]}
    ])
  end
end
