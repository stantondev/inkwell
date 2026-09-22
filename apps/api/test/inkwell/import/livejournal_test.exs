defmodule Inkwell.Import.LivejournalTest do
  use ExUnit.Case, async: false

  alias Inkwell.Import.LivejournalMarkup
  alias Inkwell.Import.Parsers.{AutoDetect, Livejournal, LivejournalPublic}

  @export """
  <?xml version="1.0" encoding='utf-8'?>
  <livejournal>
  <entry>
  <itemid>154</itemid>
  <eventtime>2004-12-21 20:00:00</eventtime>
  <logtime>2004-12-22 01:02:03</logtime>
  <subject>.Semester break.</subject>
  <event>Wow, my day was boring.
  Nathan talked to me.

  Went to see &lt;lj user="tick"&gt; later.&lt;lj-cut text="more"&gt;The rest.&lt;/lj-cut&gt;</event>
  <security>public</security>
  <allowmask>0</allowmask>
  <current_music>Blink-182 - Adam&apos;s Song</current_music>
  <current_mood>bored</current_mood>
  </entry>
  <entry>
  <itemid>155</itemid>
  <eventtime>2004-12-23 09:15:00</eventtime>
  <subject></subject>
  <event>Friends only thoughts.</event>
  <security>usemask</security>
  <allowmask>1</allowmask>
  </entry>
  <entry>
  <itemid>156</itemid>
  <eventtime>2004-12-24 09:15:00</eventtime>
  <subject>Secret</subject>
  <event><![CDATA[<b>just me</b>]]></event>
  <security>private</security>
  </entry>
  </livejournal>
  """

  @ljdump """
  <?xml version="1.0"?>
  <event>
  <itemid>42</itemid>
  <eventtime>2005-01-02 10:00:00</eventtime>
  <subject>New year</subject>
  <event>&lt;table&gt;
  &lt;tr&gt;&lt;td&gt;a&lt;/td&gt;&lt;/tr&gt;
  &lt;/table&gt;
  after</event>
  <security>public</security>
  <props><taglist>new year, life</taglist><current_mood>hopeful</current_mood></props>
  </event>
  """

  describe "export files" do
    test "reads entries, dates, mood, music and privacy" do
      assert {:ok, [first, second, third]} = Livejournal.parse(@export)

      assert first.title == ".Semester break."
      assert first.published_at == ~U[2004-12-21 20:00:00Z]
      assert first.mood == "bored"
      assert first.music == "Blink-182 - Adam's Song"
      assert first.privacy == nil
      assert first.body_html =~ "<p>Wow, my day was boring.<br>"
      assert first.body_html =~ ~s(<a href="https://tick.livejournal.com/">tick</a>)
      assert first.body_html =~ "The rest."
      refute first.body_html =~ "lj-cut"

      assert second.title == nil
      assert second.privacy == "friends_only"

      assert third.privacy == "private"
      assert third.body_html =~ "<b>just me</b>"
    end

    test "reads ljdump files, with tags and without breaking tables" do
      assert {:ok, [entry]} = Livejournal.parse(@ljdump)
      assert entry.title == "New year"
      assert entry.tags == ["new year", "life"]
      assert entry.mood == "hopeful"
      refute entry.body_html =~ "<table><br>"
      assert entry.body_html =~ "</table>after"
    end

    test "several files in a ZIP, without duplicates" do
      {:ok, {_, zip}} =
        :zip.create(~c"lj.zip", [{~c"2004-12.xml", @export}, {~c"again.xml", @export}, {~c"L-42", @ljdump}], [:memory])

      assert {:ok, entries} = Livejournal.parse(zip)
      assert length(entries) == 4
      # Oldest first
      assert hd(entries).published_at == ~U[2004-12-21 20:00:00Z]
    end

    test "auto-detect recognizes LiveJournal files" do
      assert {:ok, [_, _, _]} = AutoDetect.parse(@export)
    end

    test "a file with no entries explains what to upload" do
      assert {:error, message} = Livejournal.parse("<livejournal></livejournal>")
      assert message =~ "Export Journal"
    end
  end

  describe "markup" do
    test "plain entries become paragraphs" do
      assert LivejournalMarkup.to_html("one\ntwo\n\nthree") == "<p>one<br>\ntwo</p>\n<p>three</p>"
    end

    test "polls and embeds are dropped" do
      html = LivejournalMarkup.to_html(~s(hi <lj-poll name="x"><lj-pq>q</lj-pq></lj-poll> <lj-embed id="1" />))
      refute html =~ "lj-"
      assert html =~ "hi"
    end

    test "Dreamwidth user links point at Dreamwidth" do
      assert LivejournalMarkup.to_html(~s(<user name="some_one">), site: :dreamwidth) =~ "https://some-one.dreamwidth.org/"
    end
  end

  describe "public journal" do
    @page """
    <html><head><script>Site.entry = {"eventtime":1103659200,"title":".Grown up.","is_public":true,"ditemid":45851,"x":"{not a brace}"};</script></head>
    <body><div class="sidebar"><a href="https://xstantonx.livejournal.com/tag/everything">everything</a></div>
    <article class="aentry-post"><div class="aentry-post__content"><div class="aentry-post__text aentry-post__text--view"> Hahha, this journal <div class="x">is</div> a drama.<br />More. </div><div class="slot"></div></div>
    <a href="https://xstantonx.livejournal.com/tag/life">life</a></article></body></html>
    """

    test "normalizes usernames and journal URLs" do
      assert LivejournalPublic.normalize_username("xstantonx") == {:ok, "xstantonx"}
      assert LivejournalPublic.normalize_username("https://XStantonX.livejournal.com/") == {:ok, "xstantonx"}
      assert LivejournalPublic.normalize_username("some-one.livejournal.com") == {:ok, "some_one"}
      assert {:error, _} = LivejournalPublic.normalize_username("not a name!")
    end

    test "reads an entry page" do
      entry = LivejournalPublic.parse_entry_page(@page, "https://xstantonx.livejournal.com/45851.html")
      assert entry.title == ".Grown up."
      assert entry.published_at == ~U[2004-12-21 20:00:00Z]
      assert entry.body_html == ~s(Hahha, this journal <div class="x">is</div> a drama.<br />More.)
      assert entry.tags == ["life"]
    end

    test "private entries on a page are skipped" do
      page = String.replace(@page, ~s("is_public":true), ~s("is_public":false))
      assert LivejournalPublic.parse_entry_page(page, "u") == nil
    end

    test "walks the calendar, years, days and entries" do
      host = "https://xstantonx.livejournal.com"

      pages = %{
        "#{host}/calendar/" => ~s(<a href="#{host}/2004/">2004</a> <a href="#{host}/2005/">2005</a>),
        "#{host}/2004/" => ~s(<a href="#{host}/2004/12/21/">21</a>),
        "#{host}/2005/" => ~s(<a href="#{host}/2005/01/02/">2</a>),
        "#{host}/2004/12/21/" => ~s(<a href="#{host}/45851.html">x</a>),
        "#{host}/2005/01/02/" => ~s(<a href="#{host}/46000.html">y</a> <a href="#{host}/45851.html">again</a>),
        "#{host}/45851.html" => @page,
        "#{host}/46000.html" => String.replace(@page, "1103659200", "1104660000")
      }

      Application.put_env(:inkwell, :livejournal_fetcher, fn url ->
        case Map.fetch(pages, url) do
          {:ok, html} -> {:ok, html}
          :error -> {:error, :not_found}
        end
      end)

      on_exit(fn -> Application.delete_env(:inkwell, :livejournal_fetcher) end)

      assert {:ok, [a, b]} = LivejournalPublic.parse("xstantonx")
      assert DateTime.compare(a.published_at, b.published_at) == :lt
    end

    test "a journal that doesn't exist says so" do
      Application.put_env(:inkwell, :livejournal_fetcher, fn _ -> {:error, :not_found} end)
      on_exit(fn -> Application.delete_env(:inkwell, :livejournal_fetcher) end)
      assert {:error, message} = LivejournalPublic.parse("nobodyhere")
      assert message =~ "no journal"
    end
  end
end
