defmodule InkwellWeb.AuthControllerTest do
  @moduledoc """
  Regression tests for auto-derived usernames at signup.

  Signup derives a username from the email local-part. It used to check that
  name for *uniqueness only*, never against the rules registration_changeset
  actually enforces. So anyone whose local-part was reserved (support@, admin@,
  noreply@, or anything starting with "inkwell") or shorter than 3 characters
  (jo@, jd@) got "username is reserved" / "must be 3-30 characters" back — on a
  signup form that has no username field and no way to correct it. Those email
  addresses could never create an account.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Accounts
  alias Inkwell.Accounts.User

  # Every request in the test suite comes from the same address, and the auth
  # limiter (5 req / 5 min per IP) is now genuinely enforced, so clear the
  # bucket between tests. Before the ETS-ownership fix the table died with each
  # request and this wasn't needed.
  setup do
    if :ets.whereis(:rate_limit_buckets) != :undefined do
      :ets.delete_all_objects(:rate_limit_buckets)
    end

    :ok
  end

  defp signup(conn, email) do
    post(conn, "/api/auth/magic-link", %{email: email, terms_accepted: true})
  end

  defp assert_signed_up(conn, email) do
    assert %{"ok" => true} = json_response(conn, 200)

    user = Accounts.get_user_by_email(email)
    assert user, "signup must create an account for #{email}"

    assert String.match?(user.username, ~r/^[a-zA-Z0-9_]{3,30}$/),
           "derived username #{inspect(user.username)} violates the format rule"

    refute User.reserved_username?(user.username),
           "derived username #{inspect(user.username)} is reserved"

    user
  end

  describe "POST /api/auth/magic-link — derived username must be valid" do
    test "reserved local-part still creates an account", %{conn: conn} do
      assert_signed_up(signup(conn, "support@example.com"), "support@example.com")
    end

    test "admin local-part still creates an account", %{conn: conn} do
      assert_signed_up(signup(conn, "admin@example.com"), "admin@example.com")
    end

    test "noreply local-part still creates an account", %{conn: conn} do
      assert_signed_up(signup(conn, "noreply@example.com"), "noreply@example.com")
    end

    test "protected inkwell prefix still creates an account", %{conn: conn} do
      # A numeric suffix cannot rescue this one — "inkwellfan_1234" is still
      # reserved — so it must fall back to a generated name.
      user = assert_signed_up(signup(conn, "inkwellfan@example.com"), "inkwellfan@example.com")
      refute String.starts_with?(String.downcase(user.username), "inkwell")
    end

    test "two-character local-part still creates an account", %{conn: conn} do
      user = assert_signed_up(signup(conn, "jo@example.com"), "jo@example.com")
      assert String.length(user.username) >= 3
    end

    test "an ordinary local-part is still used verbatim", %{conn: conn} do
      user = assert_signed_up(signup(conn, "normaluser@example.com"), "normaluser@example.com")
      assert user.username == "normaluser"
    end

    test "a colliding ordinary local-part gets a suffix, not a failure", %{conn: conn} do
      first = assert_signed_up(signup(conn, "taken@example.com"), "taken@example.com")
      assert first.username == "taken"

      second = assert_signed_up(signup(build_conn(), "taken@other.example"), "taken@other.example")
      assert second.username != first.username
      assert String.starts_with?(second.username, "taken_")
    end

    test "punctuation in the local-part is normalized", %{conn: conn} do
      user = assert_signed_up(signup(conn, "first.last+tag@example.com"), "first.last+tag@example.com")
      assert String.match?(user.username, ~r/^[a-zA-Z0-9_]{3,30}$/)
    end
  end
end
