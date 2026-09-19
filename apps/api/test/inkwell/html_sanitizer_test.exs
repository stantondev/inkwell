defmodule Inkwell.HtmlSanitizerTest do
  @moduledoc """
  The sanitizer is the only thing standing between stored HTML and script
  running on inkwell.social (the web app renders entry, comment, letter,
  circle and bio HTML with dangerouslySetInnerHTML).

  Before 2026-09-19 it was a regex blacklist that passed the first three
  attacks below, and entry bodies weren't sanitized at all. These tests pin
  both halves: attacks are removed, and what the editor legitimately
  produces survives unchanged in meaning.
  """
  use ExUnit.Case, async: true

  alias Inkwell.HtmlSanitizer

  defp clean(html), do: HtmlSanitizer.sanitize(html)

  defp refute_script(out) do
    lower = String.downcase(out)
    refute lower =~ ~r/\bon[a-z]+\s*=/, "event handler survived: #{out}"
    refute lower =~ "javascript", "javascript URL survived: #{out}"
    refute lower =~ "<script", "script tag survived: #{out}"
    refute lower =~ "<svg", "svg survived: #{out}"
  end

  describe "attacks are removed" do
    for {name, payload} <- [
          {"slash-separated handler", "<img/src=x/onerror=alert(1)>"},
          {"entity-encoded javascript: link", ~s|<a href="&#106;avascript:alert(1)">x</a>|},
          {"tab-split javascript: link", "<a href=\"java\tscript:alert(1)\">x</a>"},
          {"plain handler", ~s|<img src=x onerror="alert(1)">|},
          {"uppercase handler", ~s|<IMG SRC=x ONERROR=alert(1)>|},
          {"script tag", "<p>a</p><script>alert(1)</script><p>b</p>"},
          {"svg onload", "<svg onload=alert(1)><circle/></svg>"},
          {"svg animate", "<svg><animate onbegin=alert(1) attributeName=x dur=1s>"},
          {"details ontoggle", "<details open ontoggle=alert(1)>x</details>"},
          {"iframe javascript", ~s|<iframe src="javascript:alert(1)"></iframe>|},
          {"iframe srcdoc", ~s|<iframe srcdoc="<script>alert(1)</script>"></iframe>|},
          {"object data", ~s|<object data="javascript:alert(1)"></object>|},
          {"data:text/html link", ~s|<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>|},
          {"vbscript link", ~s|<a href="vbscript:msgbox(1)">x</a>|},
          {"colon entity", ~s|<a href="javascript&colon;alert(1)">x</a>|},
          {"style expression", ~s|<p style="width: expression(alert(1))">x</p>|},
          {"style javascript url", ~s|<p style="background-image: url(javascript:alert(1))">x</p>|},
          {"form", ~s|<form action="https://evil.example"><input name=x><button>go</button></form>|},
          {"meta refresh", ~s|<meta http-equiv="refresh" content="0;url=javascript:alert(1)">|},
          {"mixed-case scheme", ~s|<a href="JaVaScRiPt:alert(1)">x</a>|}
        ] do
      test name do
        refute_script(clean(unquote(payload)))
      end
    end

    test "script bodies don't leak through as visible text" do
      refute clean("<p>hi</p><script>alert(1)</script>") =~ "alert"
    end

    test "fixed positioning (overlaying the page) is dropped from content styles" do
      refute clean(~s|<div style="position: fixed; top: 0">x</div>|) =~ "fixed"
    end

    test "profile HTML gets the same protections" do
      out = HtmlSanitizer.sanitize_profile(~s|<section><img/src=x/onerror=alert(1)><a href="&#106;avascript:x">y</a></section>|)
      refute_script(out)
      assert out =~ "<section>"
    end

    test "forms are not allowed in profile HTML" do
      refute HtmlSanitizer.sanitize_profile(~s|<form action="/api/me/email" method="post"><input name="email"></form>|) =~ "<form"
    end
  end

  describe "legitimate editor output survives" do
    test "basic formatting, links and mentions" do
      html =
        ~s|<p>Hello <strong>bold</strong> <em>it</em> <u>u</u> <s>s</s> <a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">link</a> | <>
          ~s|<a href="/alice" class="mention" data-mention="alice">@alice</a></p>|

      out = clean(html)
      assert out =~ ~s|href="https://example.com"|
      assert out =~ ~s|target="_blank"|
      assert out =~ ~s|data-mention="alice"|
      assert out =~ ~s|href="/alice"|
      assert out =~ "<strong>bold</strong>"
    end

    test "text alignment, colour and highlight styles" do
      out =
        clean(
          ~s|<p style="text-align: center">c</p><p><span style="color: #958DF1">col</span> <mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">hl</mark></p>|
        )

      assert out =~ "text-align: center"
      assert out =~ "color: #958DF1"
      assert out =~ "background-color: #fef08a"
      assert out =~ ~s|data-color="#fef08a"|
    end

    test "spacing attribute" do
      assert clean(~s|<p data-spacing="tight">x</p>|) =~ ~s|data-spacing="tight"|
    end

    test "uploaded images" do
      out = clean(~s|<p><img src="/api/images/abc-123" alt="a cat"></p>|)
      assert out =~ ~s|src="/api/images/abc-123"|
      assert out =~ ~s|alt="a cat"|
    end

    test "base64 image data stays, other data URLs don't" do
      assert clean(~s|<img src="data:image/png;base64,iVBORw0KGgo=">|) =~ "data:image/png"
    end

    test "task lists keep their checkboxes" do
      html =
        ~s|<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li></ul>|

      out = clean(html)
      assert out =~ ~s|data-type="taskList"|
      assert out =~ ~s|data-checked="true"|
      assert out =~ ~s|type="checkbox"|
      assert out =~ "checked"
    end

    test "tables" do
      out =
        clean(
          ~s|<table style="min-width: 75px"><colgroup><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>h</p></th></tr><tr><td colspan="1" rowspan="1"><p>d</p></td></tr></tbody></table>|
        )

      assert out =~ "<table"
      assert out =~ ~s|colspan="1"|
      assert out =~ "<th"
      assert out =~ "<td"
    end

    test "photo gallery" do
      html =
        ~s|<div data-photo-gallery="" data-gallery-layout="grid" data-gallery-columns="3"><figure data-gallery-photo="" data-image-id="img1" data-photo-order="0"><img src="/api/images/img1" alt="" loading="lazy"><figcaption>Cap</figcaption></figure></div>|

      out = clean(html)
      assert out =~ ~s|data-gallery-layout="grid"|
      assert out =~ ~s|data-image-id="img1"|
      assert out =~ "<figcaption>Cap</figcaption>"
    end

    test "circle embed" do
      html =
        ~s|<div data-circle-embed="" data-circle-slug="poets" data-circle-name="Poets" data-circle-description="" data-circle-category="writing_craft" data-circle-members="3"><a href="/circles/poets" class="circle-embed-link" data-circle-embed-inner=""><span class="circle-embed-icon" aria-hidden="true"></span><span class="circle-embed-name">Poets</span></a></div>|

      out = clean(html)
      assert out =~ ~s|data-circle-slug="poets"|
      assert out =~ ~s|href="/circles/poets"|
      assert out =~ ~s|class="circle-embed-name"|
    end

    test "link embed card keeps its https thumbnail" do
      html =
        ~s|<div data-link-embed="" data-link-url="https://ex.com/a" data-link-title="T" data-link-type="link"><a href="https://ex.com/a" class="link-embed-card" target="_blank" rel="noopener noreferrer"><span class="link-embed-thumbnail" style="background-image: url(https://ex.com/t.jpg)"></span><span class="link-embed-content"><span class="link-embed-title">T</span></span></a></div>|

      out = clean(html)
      assert out =~ ~s|data-link-url="https://ex.com/a"|
      assert out =~ "background-image: url(https://ex.com/t.jpg)"
      assert out =~ "link-embed-card"
    end

    test "code blocks, blockquotes, headings and lists" do
      out =
        clean(
          ~s|<h2>Head</h2><blockquote><p>q</p></blockquote><pre><code class="language-js">let a = 1 &lt; 2;</code></pre><ol start="3"><li><p>x</p></li></ol><hr>|
        )

      assert out =~ "<h2>Head</h2>"
      assert out =~ "<blockquote>"
      assert out =~ ~s|class="language-js"|
      assert out =~ "&lt;"
      assert out =~ ~s|start="3"|
      assert out =~ "<hr"
    end

    test "YouTube embeds from imported posts are kept, other iframes are not" do
      assert clean(~s|<iframe src="https://www.youtube.com/embed/abc" width="560" height="315" allowfullscreen=""></iframe>|) =~
               "youtube.com/embed/abc"

      refute clean(~s|<iframe src="https://evil.example/page"></iframe>|) =~ "iframe"
    end

    test "non-latin text and entities survive" do
      out = clean("<p>Числа и их восприятие &amp; «кавычки» — 日本語</p>")
      assert out =~ "Числа и их восприятие"
      assert out =~ "&amp;"
      assert out =~ "日本語"
    end

    test "profile HTML keeps layout and marquee" do
      out =
        HtmlSanitizer.sanitize_profile(
          ~s|<div class="wrap" style="display: flex; gap: 8px"><marquee scrollamount="3">hi</marquee><div data-inkwell-widget="entries"></div><h2>{{display_name}}</h2></div>|
        )

      assert out =~ "<marquee"
      assert out =~ ~s|scrollamount="3"|
      assert out =~ ~s|data-inkwell-widget="entries"|
      assert out =~ "{{display_name}}"
      assert out =~ "display: flex"
    end
  end
end
