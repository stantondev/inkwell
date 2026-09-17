defmodule InkwellWeb.FediverseMentionTest do
  @moduledoc """
  A fediverse mention's notification has to be readable on Inkwell: Mastodon
  direct messages 404 for anyone not signed in on that server, so the preview
  is all the recipient gets.
  """
  use ExUnit.Case, async: true

  alias InkwellWeb.FederationController

  test "decodes named and numeric HTML entities" do
    assert FederationController.decode_html_entities("I haven&#39;t &amp; won&#8217;t") == "I haven't & won’t"
    assert FederationController.decode_html_entities("&quot;quoted&quot;&nbsp;&mdash;&#x2014;") == "\"quoted\" ——"
    assert FederationController.decode_html_entities("no entities") == "no entities"
  end

  test "drops malformed numeric entities instead of crashing" do
    assert FederationController.decode_html_entities("bad &#0; &#999999999;") == "bad  "
  end
end
