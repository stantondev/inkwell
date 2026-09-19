defmodule InkwellWeb.LoginHandoffTest do
  @moduledoc """
  Cross-context sign-in handoff (ask in the app, open the email in a browser).

  Before 2026-09-19 opening the emailed link completed the handoff by itself,
  and POST /api/auth/magic-link returns the handoff ID to whoever calls it for
  any email address. So an attacker could request a link for someone else's
  email, keep the ID, and poll /api/auth/claim-session to receive that
  person's session as soon as they clicked the unexpected email. Handing over
  now requires the 4-digit code that only the requesting screen shows.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Accounts, Auth}

  setup do
    if :ets.whereis(:rate_limit_buckets) != :undefined do
      :ets.delete_all_objects(:rate_limit_buckets)
    end

    {:ok, victim} =
      Accounts.create_user(%{
        username: "handoff_victim_#{System.unique_integer([:positive])}",
        email: "victim_#{System.unique_integer([:positive])}@example.com",
        display_name: "Victim"
      })

    %{victim: victim}
  end

  # Request a link as the attacker would. In tests no email service is
  # configured, so the response also carries the link the victim would get.
  defp request_link(email) do
    body =
      build_conn()
      |> post("/api/auth/magic-link", %{email: email, terms_accepted: true})
      |> json_response(200)

    %{"token" => token} = URI.decode_query(URI.parse(body["dev_magic_link"]).query)
    {body["login_session_id"], body["handoff_code"], token}
  end

  defp victim_opens_link(token, lsid) do
    build_conn()
    |> get("/api/auth/verify", %{token: token, lsid: lsid})
    |> json_response(200)
  end

  defp claim(lsid) do
    build_conn() |> get("/api/auth/claim-session", %{id: lsid})
  end

  defp complete(session_token, lsid, code) do
    build_conn()
    |> put_req_header("authorization", "Bearer #{session_token}")
    |> post("/api/auth/complete-handoff", %{lsid: lsid, code: code})
  end

  test "magic-link response includes a 4-digit handoff code", %{victim: victim} do
    {lsid, code, _token} = request_link(victim.email)
    assert is_binary(lsid)
    assert code =~ ~r/^\d{4}$/
  end

  test "opening the link does NOT hand the session to whoever requested it", %{victim: victim} do
    {lsid, _code, token} = request_link(victim.email)

    %{"ok" => true, "token" => _victim_session} = victim_opens_link(token, lsid)

    assert %{"pending" => true} = claim(lsid) |> json_response(200)
    refute Map.has_key?(claim(lsid) |> json_response(200), "token")
  end

  test "with the right code, the requesting screen receives its own session", %{victim: victim} do
    {lsid, code, token} = request_link(victim.email)
    %{"token" => browser_session} = victim_opens_link(token, lsid)

    assert %{"ok" => true} = complete(browser_session, lsid, code) |> json_response(200)

    assert %{"ok" => true, "token" => app_session} = claim(lsid) |> json_response(200)
    assert app_session != browser_session
    assert Auth.verify_api_session_token(app_session) == victim.id

    # One-shot: a second claim finds nothing.
    assert claim(lsid).status == 404
  end

  test "a wrong code is rejected and hands nothing over", %{victim: victim} do
    {lsid, code, token} = request_link(victim.email)
    %{"token" => browser_session} = victim_opens_link(token, lsid)

    wrong = code |> String.to_integer() |> Kernel.+(1) |> rem(10_000) |> Integer.to_string() |> String.pad_leading(4, "0")
    assert complete(browser_session, lsid, wrong).status == 422
    assert %{"pending" => true} = claim(lsid) |> json_response(200)
  end

  test "five wrong codes destroy the handoff", %{victim: victim} do
    {lsid, code, token} = request_link(victim.email)
    %{"token" => browser_session} = victim_opens_link(token, lsid)

    wrong = if code == "0000", do: "1111", else: "0000"
    statuses = for _ <- 1..5, do: complete(browser_session, lsid, wrong).status
    assert List.last(statuses) == 410

    # Even the right code no longer works, and nothing can be claimed.
    assert complete(browser_session, lsid, code).status == 410
    assert claim(lsid).status == 404
  end

  test "completing a handoff requires being signed in" do
    conn = build_conn() |> post("/api/auth/complete-handoff", %{lsid: "x", code: "1234"})
    assert conn.status == 401
  end
end
