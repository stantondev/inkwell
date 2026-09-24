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

    test "a mood picked from LJ's list comes back from its id, with location" do
      xml = """
      <livejournal><entry>
      <itemid>7</itemid><eventtime>2005-03-01 22:00:00</eventtime>
      <subject>ids</subject><event>hi</event><security>public</security>
      <current_moodid>24</current_moodid>
      <current_location>the dorm</current_location>
      </entry><entry>
      <itemid>8</itemid><eventtime>2005-03-02 22:00:00</eventtime>
      <subject>custom</subject><event>hi</event><security>public</security>
      <current_moodid>31</current_moodid><current_mood>so so sleepy</current_mood>
      </entry></livejournal>
      """

      assert {:ok, [by_id, custom]} = Livejournal.parse(xml)
      assert {by_id.mood, by_id.mood_key, by_id.location} == {"pissed off", "pissed_off", "the dorm"}
      # A custom mood keeps its own words and wears the chosen face.
      assert {custom.mood, custom.mood_key} == {"so so sleepy", "tired"}
      assert Inkwell.Moods.key_for_lj_id("999") == nil
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


  describe "comments from files" do
    @meta """
    <?xml version="1.0" encoding='utf-8'?>
    <livejournal><maxid>4</maxid><comments>
    <comment id='1' posterid='7' state='A' jitemid='154' />
    </comments><usermaps>
    <usermap id='7' user='tick_1989' />
    <usermap id='9' user='xstantonx' />
    </usermaps></livejournal>
    """

    @bodies """
    <?xml version="1.0" encoding='utf-8'?>
    <livejournal><comments>
    <comment id='1' jitemid='154' posterid='7' state='A' parentid='0'>
    <subject>Re: .Semester break.</subject>
    <body>OH ya I read it hahahah</body>
    <date>2004-12-22T10:00:00Z</date>
    </comment>
    <comment id='2' jitemid='154' posterid='9' state='A' parentid='1'>
    <body>go read mine too</body>
    <date>2004-12-22T11:00:00Z</date>
    </comment>
    <comment id='3' jitemid='154' posterid='7' state='D' parentid='0'></comment>
    <comment id='4' jitemid='154' posterid='0' state='A' parentid='0'>
    <subject>Very interesting information</subject>
    <body>Hello

    Very interesting information! Thanks!</body>
    <date>2007-07-10T22:37:24Z</date>
    </comment>
    <comment id='5' jitemid='155' posterid='0' parentid='0'>
    <body>miss you, from a friend</body>
    <date>2004-12-24T08:00:00Z</date>
    </comment>
    </comments></livejournal>
    """

    test "attaches comments to their entries, threaded, without deleted ones or spam" do
      {:ok, {_, zip}} =
        :zip.create(~c"lj.zip", [{~c"2004-12.xml", @export}, {~c"meta.xml", @meta}, {~c"bodies.xml", @bodies}], [:memory])

      assert {:ok, [first, second, _third]} = Livejournal.parse(zip)

      assert [a, b] = first.comments
      assert a.author == "tick_1989"
      assert a.body_html =~ "OH ya I read it"
      # "Re:" subjects are dropped
      refute a.body_html =~ "Re:"
      assert a.posted_at == ~U[2004-12-22 10:00:00Z]
      assert b.author == "xstantonx"
      assert b.parent_source_id == "1"

      # A genuine anonymous comment stays; the spam one is gone.
      assert [anon] = second.comments
      assert anon.author == nil
      assert anon.body_html =~ "from a friend"
    end

    test "reads ljdump C- files" do
      c_file = """
      <?xml version="1.0"?>
      <comments><comment><id>11</id><parentid></parentid><subject></subject>
      <date>2005-01-03T10:00:00Z</date><body>happy new year!!</body><state>A</state><user>some_one</user></comment></comments>
      """

      {:ok, {_, zip}} = :zip.create(~c"dump.zip", [{~c"xstantonx/L-42", @ljdump}, {~c"xstantonx/C-42", c_file}], [:memory])
      assert {:ok, [entry]} = Livejournal.parse(zip)
      assert [%{author: "some_one", body_html: body}] = entry.comments
      assert body =~ "happy new year"
    end
  end

  describe "comment spam" do
    test "catches the stock compliments LJ left behind" do
      assert Inkwell.Import.LivejournalComments.spam?("Hi all! <br /> <br />Looks good! Very useful, good stuff. Good resources here.")
      assert Inkwell.Import.LivejournalComments.spam?("nice <a href=\"http://x.example\">x</a>")
      refute Inkwell.Import.LivejournalComments.spam?("lol that party was so fun, call me")
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

    test "fetches comments and rebuilds threads from their depth" do
      host = "https://xstantonx.livejournal.com"
      page = String.replace(@page, "<html>", ~s(<html><script>x={"replycount":3,"spamcount":0}</script>))

      thread =
        Jason.encode!(%{
          "comments" => [
            %{"dtalkid" => 1, "level" => 1, "loaded" => 1, "shown" => 1, "deleted" => 0, "dname" => "tick_1989", "article" => "first!", "ctime_ts" => 1_160_257_896, "subject" => "", "thread_url" => "#{host}/45851.html?thread=1"},
            %{"dtalkid" => 2, "level" => 2, "loaded" => 1, "shown" => 1, "deleted" => 0, "dname" => "xstantonx", "commenter_is_poster" => 1, "article" => "thanks tick", "ctime_ts" => 1_160_260_000, "subject" => ""},
            %{"dtalkid" => 3, "level" => 1, "loaded" => 1, "shown" => 1, "deleted" => 0, "dname" => "", "article" => "Hello <br /> <br />Very interesting information! Thanks! <br /> <br /> <br /> <br />", "ctime_ts" => 1_184_107_044, "subject" => "Very interesting information"}
          ]
        })

      pages = %{
        "#{host}/calendar/" => ~s(<a href="#{host}/2006/">2006</a>),
        "#{host}/2006/" => ~s(<a href="#{host}/2006/10/04/">4</a>),
        "#{host}/2006/10/04/" => ~s(<a href="#{host}/45851.html">x</a>),
        "#{host}/45851.html" => page,
        "#{host}/__rpc_get_thread?journal=xstantonx&itemid=45851&flat=&skip=&expand_all=1&thread=" => thread
      }

      Application.put_env(:inkwell, :livejournal_fetcher, fn url ->
        if Map.has_key?(pages, url), do: {:ok, pages[url]}, else: {:error, :not_found}
      end)

      on_exit(fn -> Application.delete_env(:inkwell, :livejournal_fetcher) end)

      assert {:ok, [entry]} = LivejournalPublic.parse("xstantonx")
      assert [a, b] = entry.comments
      assert a.author == "tick_1989"
      assert b.author == "xstantonx"
      assert b.parent_source_id == "1"
      assert b.posted_at == DateTime.from_unix!(1_160_260_000)
    end

    test "skips the comment request when the page says there are none" do
      host = "https://xstantonx.livejournal.com"
      page = String.replace(@page, "<html>", ~s(<html><script>x={"replycount":0}</script>))

      pages = %{
        "#{host}/calendar/" => ~s(<a href="#{host}/2006/">2006</a>),
        "#{host}/2006/" => ~s(<a href="#{host}/2006/10/04/">4</a>),
        "#{host}/2006/10/04/" => ~s(<a href="#{host}/45851.html">x</a>),
        "#{host}/45851.html" => page
      }

      Application.put_env(:inkwell, :livejournal_fetcher, fn url ->
        if String.contains?(url, "__rpc"), do: raise("should not be called"), else: Map.fetch(pages, url) |> then(fn {:ok, h} -> {:ok, h}; :error -> {:error, :not_found} end)
      end)

      on_exit(fn -> Application.delete_env(:inkwell, :livejournal_fetcher) end)
      assert {:ok, [%{comments: []}]} = LivejournalPublic.parse("xstantonx")
    end

    test "a journal that doesn't exist says so" do
      Application.put_env(:inkwell, :livejournal_fetcher, fn _ -> {:error, :not_found} end)
      on_exit(fn -> Application.delete_env(:inkwell, :livejournal_fetcher) end)
      assert {:error, message} = LivejournalPublic.parse("nobodyhere")
      assert message =~ "no journal"
    end
  end
end
