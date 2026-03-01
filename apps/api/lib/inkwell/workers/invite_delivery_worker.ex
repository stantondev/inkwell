defmodule Inkwell.Workers.InviteDeliveryWorker do
  @moduledoc """
  Oban worker that sends invite "sealed letter" emails via Resend.
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Inkwell.Repo
  alias Inkwell.Invitations.Invitation
  alias Inkwell.Accounts

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"invitation_id" => invitation_id}}) do
    case Repo.get(Invitation, invitation_id) do
      nil ->
        :ok

      %Invitation{status: "accepted"} ->
        :ok

      invitation ->
        inviter = Accounts.get_user!(invitation.inviter_id)
        frontend_url = Application.get_env(:inkwell, :frontend_url, "http://localhost:3000")
        invite_url = "#{frontend_url}/i/e/#{invitation.token}"

        case Inkwell.Email.send_invite_email(
               invitation.email,
               inviter,
               invite_url,
               invitation.message
             ) do
          {:ok, _} -> :ok
          {:error, reason} ->
            require Logger
            Logger.error("Failed to send invite email to #{invitation.email}: #{inspect(reason)}")
            {:error, reason}
        end
    end
  end
end
