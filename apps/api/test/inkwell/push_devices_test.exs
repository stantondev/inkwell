defmodule Inkwell.PushDevicesTest do
  use InkwellWeb.ConnCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.{Auth, Push, Repo}
  alias Inkwell.Push.{Device, Fcm}
  alias Inkwell.Workers.FcmPushWorker
  import Inkwell.Factory

  @token "fcm-token-" <> String.duplicate("a", 40)

  setup do
    key = :public_key.generate_key({:rsa, 2048, 65537})
    pem = :public_key.pem_encode([:public_key.pem_entry_encode(:RSAPrivateKey, key)])
    Application.put_env(:inkwell, :fcm, %{project_id: "inkwell-test", client_email: "push@inkwell-test.iam.gserviceaccount.com", private_key: pem})
    :persistent_term.erase({Fcm, :access_token})

    on_exit(fn ->
      Application.delete_env(:inkwell, :fcm)
      :persistent_term.erase({Fcm, :access_token})
    end)

    %{key: key}
  end

  defp stub_fcm(send_result) do
    test_pid = self()

    Req.Test.stub(Fcm, fn conn ->
      case conn.request_path do
        "/token" ->
          Req.Test.json(conn, %{"access_token" => "ya29.test", "expires_in" => 3600})

        "/v1/projects/inkwell-test/messages:send" ->
          {:ok, body, conn} = Plug.Conn.read_body(conn)
          send(test_pid, {:fcm, Jason.decode!(body), Plug.Conn.get_req_header(conn, "authorization")})

          case send_result do
            :ok -> Req.Test.json(conn, %{"name" => "projects/inkwell-test/messages/1"})
            :unregistered ->
              conn
              |> Plug.Conn.put_status(404)
              |> Req.Test.json(%{"error" => %{"status" => "NOT_FOUND", "details" => [%{"errorCode" => "UNREGISTERED"}]}})
          end
      end
    end)
  end

  test "a phone registered from the app's session is tied to that session", %{conn: conn} do
    user = create_user()
    conn = log_in_user(conn, user)
    [_ | _] = Plug.Conn.get_req_header(conn, "authorization")

    resp = post(conn, "/api/push/devices", %{token: @token, platform: "android", app_version: "0.1.0"})
    assert %{"ok" => true} = json_response(resp, 200)

    device = Repo.get_by!(Device, token: @token)
    assert device.user_id == user.id
    assert device.auth_token_id

    # Signing out deletes the session token, and the phone goes with it.
    "Bearer " <> session = conn |> Plug.Conn.get_req_header("authorization") |> hd()
    Auth.revoke_api_session_token(session)
    refute Repo.get_by(Device, token: @token)
  end

  test "a token moves to whoever registers it next (a shared phone)" do
    a = create_user()
    b = create_user()
    {:ok, _} = Push.register_device(a.id, nil, %{"token" => @token, "platform" => "android"})
    {:ok, _} = Push.register_device(b.id, nil, %{"token" => @token, "platform" => "android"})

    assert [%{user_id: user_id}] = Repo.all(Device)
    assert user_id == b.id
  end

  test "the app removes its phone", %{conn: conn} do
    user = create_user()
    {:ok, _} = Push.register_device(user.id, nil, %{"token" => @token, "platform" => "android"})

    resp = conn |> log_in_user(user) |> delete("/api/push/devices", %{token: @token})
    assert json_response(resp, 200)["ok"]
    refute Repo.get_by(Device, token: @token)
  end

  test "a notification reaches the phone through Firebase, with the page to open" do
    stub_fcm(:ok)
    user = create_user()
    {:ok, device} = Push.register_device(user.id, nil, %{"token" => @token, "platform" => "android"})

    payload = %{"title" => "New letter", "body" => "Andrew sent you a letter", "tag" => "inkwell-letter-1", "data" => %{"url" => "/letters/1"}}
    assert :ok = perform_job(FcmPushWorker, %{"device_id" => device.id, "payload" => payload})

    assert_received {:fcm, %{"message" => msg}, ["Bearer ya29.test"]}
    assert msg["token"] == @token
    assert msg["notification"] == %{"title" => "New letter", "body" => "Andrew sent you a letter"}
    assert msg["data"] == %{"url" => "/letters/1"}
    assert msg["android"]["notification"]["channel_id"] == "default"
  end

  test "an uninstalled app's phone is forgotten" do
    stub_fcm(:unregistered)
    user = create_user()
    {:ok, device} = Push.register_device(user.id, nil, %{"token" => @token, "platform" => "android"})

    assert :ok = perform_job(FcmPushWorker, %{"device_id" => device.id, "payload" => %{"title" => "x", "body" => "y"}})
    refute Repo.get(Device, device.id)
  end

  test "the JWT for Google is signed with the service account key", %{key: key} do
    {:ok, jwt} = Fcm.signed_jwt(Application.get_env(:inkwell, :fcm), 1_800_000_000)
    [h, c, sig] = String.split(jwt, ".")
    public = {:RSAPublicKey, elem(key, 2), elem(key, 3)}
    assert :public_key.verify(h <> "." <> c, :sha256, Base.url_decode64!(sig, padding: false), public)
    claims = c |> Base.url_decode64!(padding: false) |> Jason.decode!()
    assert claims["scope"] == "https://www.googleapis.com/auth/firebase.messaging"
    assert claims["aud"] == "https://oauth2.googleapis.com/token"
  end

  test "a new notification goes to the writer's phone" do
    stub_fcm(:ok)
    writer = create_user()
    reader = create_user()
    {:ok, _} = Push.register_device(writer.id, nil, %{"token" => @token, "platform" => "android"})

    {:ok, _} =
      Inkwell.Accounts.create_notification(%{type: :ink, user_id: writer.id, actor_id: reader.id})

    # Oban runs jobs inline in tests.
    assert_received {:fcm, %{"message" => %{"token" => @token, "notification" => %{"title" => "New ink"}}}, _}
  end
end
