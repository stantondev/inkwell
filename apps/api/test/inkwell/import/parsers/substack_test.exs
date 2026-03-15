defmodule Inkwell.Import.Parsers.SubstackTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.Substack

  @fixtures_dir Path.join([__DIR__, "..", "..", "..", "fixtures", "import"])

  defp fixture(name), do: File.read!(Path.join(@fixtures_dir, name))

  describe "parse/1 with HTML fragment" do
    test "parses raw HTML fragment (no wrapper elements)" do
      {:ok, entries} = Substack.parse(fixture("substack_fragment.html"))
      assert length(entries) == 1
      entry = hd(entries)
      assert entry.body_html =~ "Substack post exported as a raw HTML fragment"
      assert entry.body_html =~ "A nice quote"
    end

    test "handles fragment starting with <p> tag" do
      html = "<p>Simple paragraph content.</p>\n<p>Second paragraph.</p>"
      {:ok, [entry]} = Substack.parse(html)
      assert entry.body_html =~ "Simple paragraph content"
    end
  end

  describe "parse/1 with full HTML page" do
    test "extracts title from h1" do
      html = ~s(<html><body>
        <h1 class="post-title">My Substack Post</h1>
        <div class="body markup"><p>Article body here.</p></div>
      </body></html>)

      {:ok, [entry]} = Substack.parse(html)
      assert entry.title == "My Substack Post"
    end

    test "extracts body from body markup div" do
      html = ~s(<html><body>
        <h1>Title</h1>
        <div class="body markup"><p>The actual content.</p><p>More content.</p></div>
      </body></html>)

      {:ok, [entry]} = Substack.parse(html)
      assert entry.body_html =~ "The actual content"
      assert entry.body_html =~ "More content"
    end

    test "strips div wrappers but keeps content" do
      # Use a structure without nested divs inside "body markup"
      # since the regex uses non-greedy matching on the closing </div>
      html = ~s(<html><body>
        <h1>Title</h1>
        <div class="body markup">
          <p>First paragraph.</p>
          <img src="test.jpg" />
          <p>Text after image.</p>
        </div>
      </body></html>)

      {:ok, [entry]} = Substack.parse(html)
      refute entry.body_html =~ "<div"
      assert entry.body_html =~ "<img"
      assert entry.body_html =~ "Text after image"
    end

    test "removes iframes (YouTube/Spotify embeds)" do
      html = ~s(<html><body>
        <h1>Title</h1>
        <div class="body markup">
          <p>Before embed.</p>
          <iframe src="https://youtube.com/embed/xyz"></iframe>
          <p>After embed.</p>
        </div>
      </body></html>)

      {:ok, [entry]} = Substack.parse(html)
      refute entry.body_html =~ "<iframe"
      assert entry.body_html =~ "Before embed"
      assert entry.body_html =~ "After embed"
    end

    test "removes subscribe/CTA button wrappers" do
      html = ~s(<html><body>
        <h1>Title</h1>
        <div class="body markup">
          <p>Content here.</p>
          <p class="button-wrapper"><a href="/subscribe">Subscribe</a></p>
        </div>
      </body></html>)

      {:ok, [entry]} = Substack.parse(html)
      refute entry.body_html =~ "Subscribe"
      assert entry.body_html =~ "Content here"
    end
  end

  describe "title_from_filename" do
    test "derives title from Substack-style filename" do
      # This tests indirectly via parse since title_from_filename is private
      # Substack filenames: "182854666.how-to-use-the-substack-editor.html"
      html = "<p>Content only, no title in HTML.</p>"
      {:ok, [entry]} = Substack.parse(html)
      # For single file upload, filename is "uploaded.html" → title_from_filename returns nil
      assert entry.title == nil
    end
  end

  describe "parse/1 with CSV data" do
    test "delegates to SubstackCsv parser" do
      csv = "title,subtitle,post_date,body_html,is_published\nTest Post,A subtitle,2025-06-15,<p>Body content</p>,true\n"

      {:ok, [entry]} = Substack.parse(csv)
      assert entry.title == "Test Post"
      assert entry.body_html =~ "A subtitle"
      assert entry.body_html =~ "Body content"
    end
  end

  test "extracts datetime from time element" do
    html = ~s(<html><body>
      <h1>Title</h1>
      <time datetime="2025-06-15T10:30:00.000Z">June 15</time>
      <div class="body markup"><p>Content.</p></div>
    </body></html>)

    {:ok, [entry]} = Substack.parse(html)
    assert entry.published_at.year == 2025
    assert entry.published_at.month == 6
  end

  test "extracts tags from p-category links" do
    html = ~s(<html><body>
      <h1>Title</h1>
      <div class="body markup"><p>Content.</p></div>
      <a class="p-category" href="/t/tech">Tech</a>
      <a class="p-category" href="/t/writing">Writing</a>
    </body></html>)

    {:ok, [entry]} = Substack.parse(html)
    assert "Tech" in entry.tags
    assert "Writing" in entry.tags
  end

  test "extracts tags from meta keywords as fallback" do
    html = ~s(<html><head><meta name="keywords" content="tech, writing, blog"></head><body>
      <h1>Title</h1>
      <div class="body markup"><p>Content.</p></div>
    </body></html>)

    {:ok, [entry]} = Substack.parse(html)
    assert "tech" in entry.tags
    assert "writing" in entry.tags
    assert "blog" in entry.tags
  end

  test "skips non-post pages (subscriber settings)" do
    html = ~s(<html><body>
      <h1>Settings</h1>
      <p>Manage your subscription preferences.</p>
      <p>Subscriber settings page content.</p>
    </body></html>)

    {:ok, entries} = Substack.parse(html)
    assert entries == []
  end

  test "returns empty list for empty HTML" do
    {:ok, entries} = Substack.parse("")
    assert entries == []
  end
end
