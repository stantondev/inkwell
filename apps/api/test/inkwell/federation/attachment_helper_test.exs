defmodule Inkwell.Federation.AttachmentHelperTest do
  use ExUnit.Case, async: true

  alias Inkwell.Federation.AttachmentHelper
  alias Inkwell.HtmlSanitizer

  # What a stored remote entry ends up with: build, then the changeset's
  # sanitize pass.
  defp stored(object) do
    (object["content"] || "")
    |> HtmlSanitizer.sanitize()
    |> AttachmentHelper.append_media_attachments(object)
    |> HtmlSanitizer.sanitize()
  end

  test "Mastodon video attachment becomes a playable video that survives sanitizing" do
    html =
      stored(%{
        "content" => "<p>look</p>",
        "attachment" => [
          %{
            "type" => "Document",
            "mediaType" => "video/mp4",
            "url" => "https://files.example/v.mp4",
            "name" => "a cat",
            "width" => 1280,
            "height" => 720
          }
        ]
      })

    assert html =~ ~s(<video)
    assert html =~ ~s(src="https://files.example/v.mp4")
    assert html =~ "controls"
    assert html =~ "playsinline"
    assert html =~ ~s(width="1280")
    assert html =~ ~s(title="a cat")
    refute html =~ "autoplay"
  end

  test "Threads-style Video type with Link url and poster" do
    html =
      stored(%{
        "content" => "<p>clip</p>",
        "attachment" => [
          %{
            "type" => "Video",
            "url" => %{"type" => "Link", "href" => "https://cdn.threads.example/x.mp4", "mediaType" => "video/mp4"},
            "icon" => %{"type" => "Image", "url" => "https://cdn.threads.example/x.jpg"}
          }
        ]
      })

    assert html =~ ~s(src="https://cdn.threads.example/x.mp4")
    assert html =~ ~s(poster="https://cdn.threads.example/x.jpg")
  end

  test "list of renditions prefers a media file over an HTML page or playlist" do
    [v] =
      AttachmentHelper.extract_attachments(
        %{
          "attachment" => [
            %{
              "type" => "Video",
              "url" => [
                %{"href" => "https://tube.example/w/1", "mediaType" => "text/html"},
                %{"href" => "https://tube.example/p.m3u8", "mediaType" => "application/x-mpegURL"},
                %{"href" => "https://tube.example/1-720.mp4", "mediaType" => "video/mp4"}
              ]
            }
          ]
        },
        :video
      )

    assert v.url == "https://tube.example/1-720.mp4"
  end

  test "audio attachment becomes an audio player" do
    html =
      stored(%{
        "content" => "",
        "attachment" => [%{"type" => "Document", "mediaType" => "audio/mpeg", "url" => "https://files.example/a.mp3"}]
      })

    assert html =~ ~s(<audio)
    assert html =~ ~s(src="https://files.example/a.mp3")
    assert html =~ "controls"
  end

  test "images keep working, three or more become a gallery" do
    imgs =
      for i <- 1..3,
          do: %{"type" => "Document", "mediaType" => "image/jpeg", "url" => "https://files.example/#{i}.jpg"}

    html = stored(%{"content" => "<p>hi</p>", "attachment" => imgs})
    assert html =~ "data-photo-gallery"
    assert html =~ ~s(src="https://files.example/3.jpg")
  end

  test "non-https and already-inlined media are skipped" do
    html =
      AttachmentHelper.append_media_attachments(
        ~s(<p><a href="https://files.example/in.mp4">x</a></p>),
        %{
          "attachment" => [
            %{"type" => "Document", "mediaType" => "video/mp4", "url" => "http://files.example/v.mp4"},
            %{"type" => "Document", "mediaType" => "video/mp4", "url" => "https://files.example/in.mp4"}
          ]
        }
      )

    refute html =~ "<video"
  end

  test "sanitizer strips autoplay, event handlers and javascript: sources" do
    html =
      HtmlSanitizer.sanitize(
        ~s|<video src="javascript:alert(1)" autoplay onplay="x()"></video><video src="https://ok.example/v.mp4" autoplay controls></video>|
      )

    refute html =~ "javascript:"
    refute html =~ "autoplay"
    refute html =~ "onplay"
    assert html =~ ~s(src="https://ok.example/v.mp4")
  end

  test "short video posts still count as real content for Explore" do
    alias Inkwell.Federation.ContentQuality

    short = %{title: nil, body_html: "<p>lol</p>"}
    video = %{short | body_html: ~s(<p>lol</p><div class="fediverse-video"><video src="https://x.example/v.mp4"></video></div>)}

    refute ContentQuality.has_quality_content?(short)
    assert ContentQuality.has_quality_content?(video)
  end
end
