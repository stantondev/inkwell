defmodule Inkwell.SelfHosted do
  @moduledoc """
  Helpers for self-hosted Inkwell instances.

  When INKWELL_SELF_HOSTED=true, all users get Plus features
  and billing is disabled.
  """

  @doc "Returns true when this instance runs in self-hosted mode."
  def enabled? do
    Application.get_env(:inkwell, :self_hosted, false)
  end

  @doc """
  Returns the effective subscription tier for a user.
  In self-hosted mode, always returns "plus". Otherwise an account whose
  paid or granted Plus time has run out is "free", even if its row still
  says "plus" (see `Inkwell.Accounts.User.plus_time_ran_out?/1`).
  """
  def effective_tier(user) do
    cond do
      enabled?() -> "plus"
      Inkwell.Accounts.User.plus_time_ran_out?(user) -> "free"
      true -> user.subscription_tier || "free"
    end
  end
end
