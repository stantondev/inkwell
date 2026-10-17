defmodule Inkwell.Billing.ThankYou do
  @moduledoc """
  A short, personal thank-you email after someone pays for Inkwell: Plus,
  a Founding membership, or a one-time gift. Square sends the receipt; this
  is the note from the person who runs the site. Plain text in Stanton's
  voice, replyable, and skipped for anyone who can't or doesn't want email.

  `queue/3` is called from the places a payment is first recognised. Jobs are
  unique per user, kind and payment reference, so a webhook and the billing
  page's sync both noticing the same payment send one note.
  """

  alias Inkwell.Accounts.User
  alias Inkwell.Billing.Trials

  require Logger

  @kinds ~w(plus founding gift)

  def queue(user, kind, ref, amount_cents \\ nil)

  def queue(%User{} = user, kind, ref, amount_cents) when kind in @kinds do
    if Trials.emailable?(user) and not Inkwell.SelfHosted.enabled?() do
      %{"user_id" => user.id, "kind" => kind, "ref" => to_string(ref), "amount_cents" => amount_cents}
      |> Inkwell.Workers.ThankYouEmailWorker.new()
      |> Oban.insert()
    end

    :ok
  rescue
    e ->
      # Never let a thank-you note get in the way of recording a payment.
      Logger.warning("[ThankYou] couldn't queue #{kind} note: #{Exception.message(e)}")
      :ok
  end

  def queue(_, _, _, _), do: :ok

  @doc "Subject and plain-text body for a thank-you note."
  def email_content("plus", %User{} = user, _amount_cents) do
    body = """
    Hey #{first_name(user)}!

    Thank you for getting Plus. It genuinely matters: Inkwell has no ads and no investors, so members are the ones keeping the servers on. You can see exactly where the money goes here:
    #{url("/transparency")}

    Your custom domain, reader stats and the rest of Plus are on now. If anything doesn't work the way you expected, or there's something you wish Plus did, just reply. I read every one.
    """

    {"Thank you for supporting Inkwell", body}
  end

  def email_content("founding", %User{} = user, _amount_cents) do
    number = if user.founding_member_number, do: " ##{user.founding_member_number}", else: ""

    body = """
    Hey #{first_name(user)}!

    Thank you for becoming Founding Member#{number}. You'll have Plus for as long as Inkwell runs, and the number on your profile is yours.

    I can't overstate how much this helps. Inkwell is run by one person with no ads and no investors, and Founding Members are a big part of what keeps it going. The books are public if you're curious:
    #{url("/transparency")}

    If you ever have an idea, a complaint or a bug, just reply. I read every one.
    """

    {"Thank you, Founding Member#{number}", body}
  end

  def email_content("gift", %User{} = user, amount_cents) do
    amount = if is_integer(amount_cents), do: " of $#{format_dollars(amount_cents)}", else: ""

    body = """
    Hey #{first_name(user)}!

    Thank you for your gift#{amount} to Inkwell. It goes straight to the servers, and it means a lot that you chose to give when nothing required it.

    Here's where the money goes:
    #{url("/transparency")}

    If there's ever anything I can do for you on Inkwell, just reply.
    """

    {"Thank you for your gift", body}
  end

  defp format_dollars(cents) when rem(cents, 100) == 0, do: Integer.to_string(div(cents, 100))
  defp format_dollars(cents), do: :erlang.float_to_binary(cents / 100, decimals: 2)

  defp first_name(%User{display_name: name}) when is_binary(name) and name != "" do
    name |> String.split(~r/\s+/, trim: true) |> List.first()
  end

  defp first_name(%User{username: username}), do: username

  defp url(path), do: Inkwell.Instance.frontend_url() <> path
end
