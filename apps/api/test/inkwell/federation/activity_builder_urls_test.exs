defmodule Inkwell.Federation.ActivityBuilderUrlsTest do
  use ExUnit.Case, async: false

  alias Inkwell.Federation.ActivityBuilder
  alias Inkwell.Journals.Entry
  alias Inkwell.Accounts.User

  describe "absolutize_urls/2" do
    test "rewrites root-relative src and href" do
      html = ~s(<p><img src="/api/images/abc"> <a href="/alice" class="mention">@alice</a></p>)

      assert ActivityBuilder.absolutize_urls(html, "https://inkwell.social") ==
               ~s(<p><img src="https://inkwell.social/api/images/abc"> <a href="https://inkwell.social/alice" class="mention">@alice</a></p>)
    end

    test "leaves absolute, protocol-relative and fragment URLs alone" do
      html =
        ~s(<img src="https://cdn.example/x.png"><a href="//example.com/y">y</a><a href="#top">t</a><a href="mailto:a@b.c">m</a>)

      assert ActivityBuilder.absolutize_urls(html, "https://inkwell.social") == html
    end

    test "handles single quotes, trailing slash on base, and nil" do
      assert ActivityBuilder.absolutize_urls("<img src='/api/images/1'>", "https://inkwell.social/") ==
               "<img src='https://inkwell.social/api/images/1'>"

      assert ActivityBuilder.absolutize_urls(nil, "https://inkwell.social") == nil
    end
  end

  describe "build_article/2" do
    setup do
      prev = Application.get_env(:inkwell, :federation)

      Application.put_env(:inkwell, :federation,
        instance_host: "inkwell.social",
        frontend_host: "https://inkwell.social"
      )

      on_exit(fn ->
        if prev, do: Application.put_env(:inkwell, :federation, prev),
          else: Application.delete_env(:inkwell, :federation)
      end)
    end

    test "inline images in content and attachments are absolute" do
      author = %User{id: Ecto.UUID.generate(), username: "alice", display_name: "Alice"}

      entry = %Entry{
        id: Ecto.UUID.generate(),
        slug: "hello",
        title: "Hello",
        body_html: ~s(<p>Hi</p><figure><img src="/api/images/img-1"><figcaption>Cap</figcaption></figure><p><img src="/api/images/img-2"></p>),
        published_at: ~U[2026-09-01 12:00:00.000000Z],
        updated_at: ~U[2026-09-01 12:00:00.000000Z],
        tags: []
      }

      article = ActivityBuilder.build_article(entry, author)

      refute article["content"] =~ ~s(src="/api)

      assert article["content"] =~ ~s(src="https://inkwell.social/api/images/img-1")

      urls = Enum.map(article["attachment"] || [], & &1["url"])
      assert urls == ["https://inkwell.social/api/images/img-1", "https://inkwell.social/api/images/img-2"]
    end
  end
end
