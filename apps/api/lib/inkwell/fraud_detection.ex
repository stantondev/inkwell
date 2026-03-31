defmodule Inkwell.FraudDetection do
  @moduledoc """
  Lightweight fraud detection helpers.
  Currently: disposable/temporary email domain detection.
  """

  # Common disposable email providers — blocks signups from throwaway addresses
  # used for card testing and subscription fraud.
  @disposable_domains MapSet.new([
    "10minutemail.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamail.de",
    "grr.la",
    "guerrillamailblock.com",
    "mailinator.com",
    "maildrop.cc",
    "tempmail.com",
    "temp-mail.org",
    "throwaway.email",
    "throwaway.email",
    "yopmail.com",
    "yopmail.fr",
    "dispostable.com",
    "mailnesia.com",
    "tempail.com",
    "sharklasers.com",
    "guerrillamail.info",
    "spam4.me",
    "trashmail.com",
    "trashmail.me",
    "trashmail.net",
    "trashmail.org",
    "bugmenot.com",
    "mailcatch.com",
    "mytemp.email",
    "fakeinbox.com",
    "tempinbox.com",
    "discard.email",
    "mailnull.com",
    "spamgourmet.com",
    "getairmail.com",
    "mohmal.com",
    "emailondeck.com",
    "getnada.com",
    "temp-mail.io",
    "tempmailo.com",
    "burnermail.io",
    "inboxkitten.com",
    "mailsac.com",
    "harakirimail.com",
    "33mail.com",
    "maildrop.cc",
    "mailexpire.com",
    "minutemail.com",
    "tempr.email",
    "tmail.ws",
    "tmpmail.net",
    "tmpmail.org"
  ])

  @doc """
  Returns true if the email address uses a known disposable/temporary email domain.
  """
  def disposable_email?(email) when is_binary(email) do
    case String.split(email, "@") do
      [_, domain] -> MapSet.member?(@disposable_domains, String.downcase(domain))
      _ -> false
    end
  end

  def disposable_email?(_), do: false
end
