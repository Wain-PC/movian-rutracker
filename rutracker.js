/**
 * rutracker.org plugin for Showtime
 *
 *  Copyright (C) 2014-2016 Wain
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

(function (plugin) {
  var config = {
    pluginInfo: plugin.getDescriptor(),
    prefix: plugin.getDescriptor().id,
    logo: plugin.path + "logo.png",
    colors: {
      blue: "6699CC",
      orange: "FFA500",
      red: "EE0000",
      green: "008B45",
      yellow: "ffff00",
    },
    headers: {
      Connection: "keep-alive",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "Upgrade-Insecure-Requests": 1,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36",
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "ru,en-US;q=0.9,en;q=0.8,uk;q=0.7",
    },
    regExps: {
      mainSeed: /<span class=\"seed\">.*<b>([\d]{0,200}?)<\/b><\/span>/,
      mainLich: /<span class=\"leech\">.*<b>([\d]{0,200}?)<\/b><\/span>/,
      mainSearch:
        /<a data-topic.*href="viewtopic\.php\?t=([\d]{0,200}?)">([\s\S]*?)<\/a>/g,
      login:
        /<a id="logged-in-username" class="truncated-text" href=".*u=[\d]{0,200}?">([\s\S]*?)<\/a>/g,
      mainCategoryHeader:
        /<h3 class="cat_title"><a href=".*?">([\s\S]*?)<\/a><\/h3>/g,
      mainSubforum:
        /<h4 class="forumlink"><a href="viewforum\.php\?f=([\s\S]{0,200}?)">([\s\S]*?)<\/a><\/h4>/g,
      topic:
        /<[a-zA-Z].*class=.*href="viewtopic\.php\?t=([\d]{0,200}?)" .*class=".*tt-text*?">([\s\S]*?)<\/a>/g,
      bookmarks:
        /<span.* href="viewtopic\.php\?t=([\d]{0,200}?)" .*class=".*text*?">([\s\S]*?)<\/a>/g,
      userCookie: /bb_session=\d+/,
      captcha:
        /<div><img src="\w+:\/\/(.*?)"[.\w\W]*?<input type="hidden" name="cap_sid" value="(.*?)">[.\w\W]*?<input class="reg-input" type="text" name="(.*?)"/g,
      authFail: /<h4 class="warnColor1 tCenter mrg_16">/,
      search: {
        info: /<a class="small tr-dl dl-stub" href=".*?">(.*) &#8595;<\/a>[\W\w.]*?<b class="seedmed">(\d{0,10})<\/b>[\W\w.]*?title="Личи"><b>(\d{0,10})<\/b>/gm,
        name: /<a data-topic_id="(\d{0,10})".*?href="(.*)">(.*)<\/a>/g,
      },
    },
  };

  var service = plugin.createService(
    config.pluginInfo.title,
    config.prefix + ":start",
    "video",
    true,
    config.logo
  );
  var settings = plugin.createSettings(
    config.pluginInfo.title,
    config.logo,
    config.pluginInfo.synopsis
  );
  settings.createInfo(
    "info",
    config.logo,
    "Plugin developed by " + config.pluginInfo.author + ". \n"
  );

  settings.createDivider("Settings");
  settings.createString("domain", "Домен", "rutracker.org", function (v) {
    service.domain = v;
  });
  settings.createString(
    "userCookie",
    "Cookie пользователя",
    "DONT_TOUCH_THIS",
    function (v) {
      service.userCookie = v;
    }
  );
  settings.createBool(
    "torrentLink",
    "Видимость Torrent ссылок",
    0,
    function (v) {
      service.torrentLink = v;
    }
  );

  config.urls = {
    base: "https://" + service.domain + "/forum/",
    login: "https://" + service.domain + "/forum/login.php",
    parts: {
      index: "index.php",
      topic: "viewtopic.php?t=",
      search: "tracker.php?nm=",
      subforum: "viewforum.php?f=",
      bookmarks: "bookmarks.php",
    },
  };

  function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + "</font>";
  }

  function setPageHeader(page, title) {
    if (page.metadata) {
      page.metadata.title = title;
      page.metadata.logo = config.logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
  }

  //search
  plugin.addURI(
    config.prefix + ":search:(.*):(.*)",
    function (page, forumId, search) {
      var search,
        topicItem,
        forumId,
        tryToSearch = true,
        url =
          config.urls.base +
          config.urls.parts.search +
          encodeURIComponent(search) +
          "&f=" +
          forumId +
          "&o=10",
        pageNum = 0;
      itemCount = 0;
      topicCount = 0;

      setPageHeader(page, "Результат поиска по запросу : " + search);

      //page.appendItem(config.prefix + ":forum:" + encodeURIComponent(search), "directory", {
      //    title: new showtime.RichText(url),
      //});

      subforumLoader();
      page.asyncPaginator = subforumLoader;

      function subforumLoader() {
        var response,
          dom,
          nextURL,
          textContent,
          html = require("showtime/html");
        if (!tryToSearch) {
          return page.haveMore(false);
        }
        page.loading = true;
        response = showtime
          .httpReq(url, {
            headers: config.headers,
            debug: true,
          })
          .convertFromEncoding("windows-1251")
          .toString();
        dom = html.parse(response);
        page.loading = false;
        pageNum++;

        //searching for SUBFORUMS
        //forumItem = config.regExps.mainSearch.exec(response);

        //if (forumItem && pageNum === 1) {
        //    page.appendItem("", "separator", {
        //        title: "Форумы"
        //    });
        //}

        itemCount++;

        //while (forumItem) {
        //    forumTitle = forumItem[2];
        //	itemCount++;
        //    page.appendItem(config.prefix + ":forum:" + forumItem[1] + ':0:' + encodeURIComponent(forumTitle), "directory", {
        //        title: new showtime.RichText(itemCount+" | "+forumTitle)
        //    });
        //    forumItem = config.regExps.mainSubforum.exec(response);
        //}

        //SUBFORUMS ended, add separator

        //searching for TOPICS.
        //1-topicId, 2-topicTitle
        topicItem = config.regExps.mainSearch.exec(response);
        if (topicItem && pageNum === 1) {
          page.appendItem("", "separator", {
            title: "Темы",
          });
        }

        while (topicItem) {
          topicTitle = topicItem[2];
          //отсеем те темы, которые называются "1". Это не темы на самом деле, а ссылки для перехода на страницу темы,
          //типа "Стр. 1"
          if (topicTitle !== "1") {
            topicCount++;
            if (/720/.test(topicTitle)) {
              logofilm = plugin.path + "720.png";
            } else if (/1080/.test(topicTitle)) {
              logofilm = plugin.path + "1080.png";
            } else if (/2160/.test(topicTitle)) {
              logofilm = plugin.path + "4k.png";
            } else {
              logofilm = plugin.path + "none.png";
            }
            page.appendItem(
              config.prefix +
                ":topic:" +
                topicItem[1] +
                ":" +
                encodeURIComponent(topicTitle),
              "directory",
              {
                title: new showtime.RichText(topicCount + " | " + topicTitle),
                icon: logofilm,
              }
            );
          }
          topicItem = config.regExps.mainSearch.exec(response);
        }

        //try to get the link to the next page
        //pg-jump-menu
        try {
          nextURL = dom.root
            .getElementByClassName("bottom_info")[0]
            .getElementByClassName("pg");
          nextURL = nextURL[nextURL.length - 1];
          textContent = nextURL.textContent;
          nextURL = nextURL.attributes.getNamedItem("href").value;

          if (!nextURL || textContent !== "След.") {
            return page.haveMore(false);
          } else {
            url = config.urls.base + nextURL;
            return page.haveMore(true);
          }
        } catch (err) {
          return page.haveMore(false);
        }
      }
    }
  );

  //bookmarks
  plugin.addURI(config.prefix + ":bookmarks", function (page) {
    var search,
      topicItem,
      forumId,
      tryToSearch = true,
      url = config.urls.base + config.urls.parts.bookmarks,
      pageNum = 0;
    itemCount = 0;
    topicCount = 0;

    setPageHeader(page, "Избранное");

    subforumLoader();
    page.asyncPaginator = subforumLoader;

    function subforumLoader() {
      var response,
        dom,
        nextURL,
        textContent,
        html = require("showtime/html");
      if (!tryToSearch) {
        return page.haveMore(false);
      }
      page.loading = true;
      response = showtime
        .httpReq(url, {
          headers: config.headers,
          debug: true,
        })
        .convertFromEncoding("windows-1251")
        .toString();
      dom = html.parse(response);
      page.loading = false;
      pageNum++;
      itemCount++;

      //SUBFORUMS ended, add separator

      //searching for TOPICS.
      //1-topicId, 2-topicTitle
      topicItem = config.regExps.bookmarks.exec(response);
      if (topicItem && pageNum === 1) {
        page.appendItem("", "separator", {
          title: "Темы",
        });
      }

      while (topicItem) {
        topicTitle = topicItem[2];
        //отсеем те темы, которые называются "1". Это не темы на самом деле, а ссылки для перехода на страницу темы,
        //типа "Стр. 1"
        if (topicTitle !== "1") {
          topicCount++;
          if (/720/.test(topicTitle)) {
            logofilm = plugin.path + "720.png";
          } else if (/1080/.test(topicTitle)) {
            logofilm = plugin.path + "1080.png";
          } else if (/2160/.test(topicTitle)) {
            logofilm = plugin.path + "4k.png";
          } else {
            logofilm = plugin.path + "none.png";
          }
          page.appendItem(
            config.prefix +
              ":topic:" +
              topicItem[1] +
              ":" +
              encodeURIComponent(topicTitle),
            "directory",
            {
              title: new showtime.RichText(topicCount + " | " + topicTitle),
              icon: logofilm,
            }
          );
        }
        topicItem = config.regExps.bookmarks.exec(response);
      }

      //try to get the link to the next page
      //pg-jump-menu
      try {
        nextURL = dom.root
          .getElementByClassName("bottom_info")[0]
          .getElementByClassName("pg");
        nextURL = nextURL[nextURL.length - 1];
        textContent = nextURL.textContent;
        nextURL = nextURL.attributes.getNamedItem("href").value;

        if (!nextURL || textContent !== "След.") {
          return page.haveMore(false);
        } else {
          url = config.urls.base + nextURL;
          return page.haveMore(true);
        }
      } catch (err) {
        return page.haveMore(false);
      }
    }
  });

  //Start page
  //There's a list of all forums and subforums being shown
  plugin.addURI(config.prefix + ":start", function (page) {
    var doc, loginState, mainSubforum, forumItem, forumTitle;
    setPageHeader(page, config.pluginInfo.synopsis);
    page.loading = true;
    doc = showtime.httpReq(config.urls.base + config.urls.parts.index, {
      headers: config.headers,
      debug: true,
    });
    const convertedDoc = doc.convertFromEncoding("windows-1251").toString();
    page.loading = false;

    //check for LOGIN state
    loginState = config.regExps.login.exec(convertedDoc);
    console.log("!!!loginState", loginState);
    if (!loginState) {
      redirectTo(page, "login", { showAuth: false });
      return;
    } else {
      saveUserCookie(doc.multiheaders, true);
      if (!service.userCookie.match(config.regExps.userCookie)) {
        page.redirect(config.prefix + ":logout:false:null:null");
      }

      page.appendItem(config.prefix + ":logout:true:null:null", "directory", {
        title: new showtime.RichText("Выйти из аккаунта " + loginState[1]),
      });

      page.appendItem(config.prefix + ":search:0:", "search", {
        title: "Поиск на " + service.domain,
      });
    }

    //1-title, 2- HTML contents
    mainSubforum = config.regExps.mainCategoryHeader.exec(convertedDoc);
    //while (mainSubforum) {
    page.appendItem("", "separator", {
      //title: mainSubforum[1]
      title: "Видео",
    });
    // 1-forumId, 2 - title
    //forumItem = config.regExps.mainSubforum.exec(mainSubforum[2]);
    forumItem = config.regExps.mainSubforum.exec(convertedDoc);

    while (forumItem) {
      forumTitle = forumItem[2];
      if (
        forumTitle.match(
          /^(Разное \(раздачи\)|Видео|Видео HD|Наше кино|Зарубежное кино|Арт-хаус и авторское кино|Театр|DVD Video|HD Video|3D\/Стерео Кино\, Видео\, TV и Спорт|Мультфильмы|Мультсериалы|Аниме|Русские сериалы|Зарубежные сериалы|Зарубежные сериалы \(HD Video\)|Сериалы Латинской Америки\, Турции и Индии|Азиатские сериалы|Вера и религия|Документальные фильмы и телепередачи|Документальные \(HD Video\)|Развлекательные телепередачи и шоу\, приколы и юмор|Зимние Олимпийские игры 2018|Спортивные турниры, фильмы и передачи|.*Футбол|.*Баскетбол|.*Хоккей|Рестлинг|Видеоуроки и обучающие интерактивные DVD|Боевые искусства \(Видеоуроки\)|Компьютерные видеоуроки и обучающие интерактивные DVD|Фильмы и передачи по авто\/мото")$/
        )
      ) {
        page.appendItem(
          config.prefix +
            ":forum:" +
            forumItem[1] +
            ":0:" +
            encodeURIComponent(forumTitle),
          "directory",
          {
            //page.appendItem(config.prefix + ".org/forum/viewforum.php?f=" + forumItem[1], "directory", {
            title: new showtime.RichText(forumTitle),
            icon: plugin.path + "folder.png",
          }
        );
      }
      forumItem = config.regExps.mainSubforum.exec(convertedDoc);
    }

    if (!!loginState) {
      page.appendItem("", "separator", {
        title: "",
      });
      logobookmarks = plugin.path + "bookmarks.png";
      page.appendItem(config.prefix + ":bookmarks", "directory", {
        title: new showtime.RichText("Избранное"),
        icon: logobookmarks,
      });
      page.appendItem("", "separator", {
        title: "",
      });
      logoexit = plugin.path + "exit.png";
      page.appendItem(config.prefix + ":logout:true:null:null", "directory", {
        title: new showtime.RichText(
          coloredStr("Выйти из аккаунта " + loginState[1], config.colors.red)
        ),
        icon: logoexit,
      });
    }

    //mainSubforum = config.regExps.mainCategoryHeader.exec(doc);
    //}
  });

  //Subforums page. This may contain a list of nested subforums and a list of topics
  plugin.addURI(
    config.prefix + ":forum:(.*):(.*):(.*)",
    function (page, forumId, forumPage, forumTitle) {
      var forumItem,
        topicItem,
        topicTitle,
        tryToSearch = true,
        url = config.urls.base + config.urls.parts.subforum + forumId,
        pageNum = 0;
      itemCount = 0;
      topicCount = 0;

      setPageHeader(page, decodeURIComponent(forumTitle));
      subforumLoader();
      page.asyncPaginator = subforumLoader;

      function subforumLoader() {
        var response,
          dom,
          nextURL,
          textContent,
          imglogo,
          html = require("showtime/html");
        if (!tryToSearch) {
          return page.haveMore(false);
        }
        page.loading = true;
        response = showtime
          .httpReq(url, {
            headers: config.headers,
            debug: true,
          })
          .convertFromEncoding("windows-1251")
          .toString();
        dom = html.parse(response);
        page.loading = false;
        pageNum++;

        if (pageNum === 1) {
          page.appendItem(
            config.prefix + ":search:" + forumId + ":",
            "search",
            {
              title: "Поиск в разделе " + decodeURIComponent(forumTitle),
            }
          );
        }

        //searching for SUBFORUMS
        forumItem = config.regExps.mainSubforum.exec(response);
        if (forumItem && pageNum === 1) {
          page.appendItem("", "separator", {
            title: "Форумы",
          });
        }

        while (forumItem) {
          forumTitle = forumItem[2];
          itemCount++;
          page.appendItem(
            config.prefix +
              ":forum:" +
              forumItem[1] +
              ":0:" +
              encodeURIComponent(forumTitle),
            "directory",
            {
              title: new showtime.RichText(itemCount + " | " + forumTitle),
              icon: plugin.path + "folder.png",
            }
          );
          forumItem = config.regExps.mainSubforum.exec(response);
        }

        //SUBFORUMS ended, add separator

        //searching for TOPICS.
        //1-topicId, 2-topicTitle
        topicItem = config.regExps.topic.exec(response);
        if (topicItem && pageNum === 1) {
          page.appendItem("", "separator", {
            title: "Темы",
          });
        }
        while (topicItem) {
          topicTitle = topicItem[2];
          //отсеем те темы, которые называются "1". Это не темы на самом деле, а ссылки для перехода на страницу темы,
          //типа "Стр. 1"
          if (topicTitle !== "1") {
            topicCount++;
            //imglogo = topicTitle
            if (/720/.test(topicTitle)) {
              logofilm = plugin.path + "720.png";
            } else if (/1080/.test(topicTitle)) {
              logofilm = plugin.path + "1080.png";
            } else if (/2160/.test(topicTitle)) {
              logofilm = plugin.path + "4k.png";
            } else {
              logofilm = plugin.path + "none.png";
            }
            page.appendItem(
              config.prefix +
                ":topic:" +
                topicItem[1] +
                ":" +
                encodeURIComponent(topicTitle),
              "directory",
              {
                title: new showtime.RichText(topicCount + " | " + topicTitle),
                icon: logofilm,
              }
            );
          }
          topicItem = config.regExps.topic.exec(response);
        }

        //try to get the link to the next page
        //pg-jump-menu
        try {
          nextURL = dom.root
            .getElementByClassName("bottom_info")[0]
            .getElementByClassName("pg");
          nextURL = nextURL[nextURL.length - 1];
          textContent = nextURL.textContent;
          nextURL = nextURL.attributes.getNamedItem("href").value;

          if (!nextURL || textContent !== "След.") {
            return page.haveMore(false);
          } else {
            url = config.urls.base + nextURL;
            return page.haveMore(true);
          }
        } catch (err) {
          return page.haveMore(false);
        }
      }
    }
  );

  //Topic
  plugin.addURI(
    config.prefix + ":topic:(.*):(.*)",
    function (page, topicId, topicTitle) {
      var doc,
        html = require("showtime/html"),
        pageNum = 0,
        tryToSearch = true,
        url = config.urls.base + config.urls.parts.topic + topicId;
      setPageHeader(page, decodeURIComponent(topicTitle));
      topicLoader();
      page.asyncPaginator = topicLoader;

      function getLink(type, postBody) {
        var link = "",
          className,
          postImage = null,
          postBodyContents = "",
          redirectState;

        if (type === "torrent") {
          className = "dl-link";
        } else {
          type = "magnet";
          className = "med magnet-link";
        }

        //trying to get the image
        try {
          if (postBody) {
            postImage = postBody
              .getElementByClassName("postImg postImgAligned img-right")[0]
              .attributes.getNamedItem("title").value;
            postBodyContents = postBody.textContent || "";
          } else {
            postBodyContents = "";
          }
        } catch (err) {
          postBodyContents = "";
        }

        //trying to get link
        try {
          link = postBody
            .getElementByClassName(className)[0]
            .attributes.getNamedItem("href").value;
        } catch (err) {
          link = null;
        }

        if (link) {
          if (type === "torrent") {
            redirectState =
              config.prefix + ":" + type + ":" + encodeURIComponent(link);
          } else {
            type = "magnet";
            redirectState = "torrent:browse:" + decodeURIComponent(link);
          }

          if (service.torrentLink === 1) {
            page.appendItem(redirectState, "video", {
              title: type + " : " + decodeURIComponent(topicTitle),
              icon: postImage,
              description: new showtime.RichText(postBodyContents),
            });
          } else {
            if (type === "magnet") {
              page.appendItem(redirectState, "video", {
                title: decodeURIComponent(topicTitle),
                icon: postImage,
                description: new showtime.RichText(postBodyContents),
              });
            }
          }
        } else {
          page.appendPassiveItem("video", null, {
            title: "Ссылка на ." + type + " не найдена",
            icon: postImage,
            description: new showtime.RichText(postBodyContents),
          });
        }
      }

      function topicLoader() {
        var dom,
          nextURL,
          textContent,
          firstPost,
          postBodies,
          i,
          length,
          commentText,
          html = require("showtime/html");
        if (!tryToSearch) {
          return page.haveMore(false);
        }
        page.loading = true;
        //проверяем куки, если нет, то нужно перелогиниться или залогиниться, используя сохраненные данные
        if (!service.userCookie.match(config.regExps.userCookie)) {
          page.redirect(
            config.prefix + ":logout:false:" + topicId + ":" + topicTitle
          );
          return page.haveMore(false);
        }

        doc = showtime.httpReq(url, {
          headers: config.headers,
        });
        dom = html.parse(doc);
        page.loading = false;
        pageNum++;

        postBodies = dom.root.getElementByClassName("post_body");
        firstPost = dom.root.getElementByClassName("post_wrap")[0];

        try {
          seedCountHtml = config.regExps.mainSeed.exec(doc);
          seedCount = seedCountHtml[1];
        } catch (err) {
          seedCount = 0;
        }

        try {
          lichCountHtml = config.regExps.mainLich.exec(doc);
          lichCount = lichCountHtml[1];
        } catch (err) {
          lichCount = 0;
        }

        //if we're on the first page, first post must be parsed separately
        if (pageNum === 1) {
          page.appendItem("", "separator", {
            title: "Ссылки",
          });

          getLink("torrent", firstPost);
          getLink("magnet", firstPost);

          page.appendItem("", "separator", {
            title: new showtime.RichText(
              "Сиды: " +
                coloredStr(seedCount, config.colors.green) +
                " | Личи: " +
                coloredStr(lichCount, config.colors.red)
            ),
          });

          i = 1;
          page.appendItem("", "separator", {
            title: "Комментарии",
          });
        } else {
          i = 0;
        }
        length = postBodies.length;
        for (i; i < length; i++) {
          if (postBodies[i].textContent) {
            commentText = postBodies[i].textContent;
            page.appendPassiveItem("video", null, {
              title: commentText.trim(),
              description: new showtime.RichText(postBodies[i].textContent),
            });
          }
        }

        //try to get the link to the next page
        try {
          nextURL = dom.root
            .getElementByClassName("nav pad_6 row1")[0]
            .getElementByClassName("pg");
          nextURL = nextURL[nextURL.length - 1];
          textContent = nextURL.textContent;
          nextURL = nextURL.attributes.getNamedItem("href").value;

          if (!nextURL || textContent !== "След.") {
            return page.haveMore(false);
          } else {
            url = config.urls.base + nextURL;
            return page.haveMore(true);
          }
        } catch (err) {
          return page.haveMore(false);
        }
      }
    }
  );

  plugin.addURI(config.prefix + ":torrent:(.*)", function (page, dlHref) {
    var http = require("showtime/http"),
      x;
    dlHref = decodeURIComponent(dlHref);

    if (!~dlHref.indexOf(config.urls.base)) {
      dlHref = config.urls.base + dlHref;
    }

    x = http.request(dlHref, {
      args: {
        dummy: "",
      },
      headers: {
        Cookie: service.userCookie + " bb_dl=" + dlHref + ";",
      },
    });
    page.redirect(
      "torrent:browse:data:application/x-bittorrent;base64," +
        Duktape.enc("base64", x.bytes)
    );
  });

  var redirectTo = function (page, state, stateParams) {
      return page.redirect(
        config.prefix +
          ":" +
          state +
          ":" +
          encodeURIComponent(showtime.JSONEncode(stateParams))
      );
    },
    redirectFrom = function (options) {
      return showtime.JSONDecode(decodeURIComponent(options));
    };

  //Login form
  plugin.addURI(config.prefix + ":login:(.*)", function (page, options) {
    //AUTH!
    var credentials, request, response, captchaResult;

    //decode options
    options = redirectFrom(options);

    while (1) {
      credentials = plugin.getAuthCredentials(
        plugin.getDescriptor().synopsis,
        "Login required",
        options.showAuth
      );

      if (credentials.rejected) return; //rejected by user
      if (credentials) {
        page.loading = true;
        request = {
          debug: true,
          method: "POST",
          postdata: {
            login_username: credentials.username,
            login_password: credentials.password,
            login: encodeURIComponent("Вход"),
          },
          noFollow: true,
          headers: {
            Referer: config.urls.base,
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: "",
          },
        };
        if (options.captchaSid) {
          request.postdata["cap_sid"] = options.captchaSid;
          request.postdata[options.capCodeName] = options.captchaValue;
        }
        response = showtime.httpReq(config.urls.login, request);
        page.loading = false;
        console.log("!!!auth all headers", response.allheaders);
        saveUserCookie(response.multiheaders, true);
        captchaResult = config.regExps.captcha.exec(response.toString());
        if (captchaResult) {
          page.redirect(
            config.prefix +
              ":captcha:" +
              encodeURIComponent(captchaResult[1]) +
              ":" +
              captchaResult[2] +
              ":" +
              captchaResult[3]
          );
          break;
        }
        response = response.toString();
        options.showAuth = response.match(config.regExps.authFail);
        if (!options.showAuth) break;
      }
      options.showAuth = true;
    }

    //AUTH END
    if (options.topicId && options.topicId !== "null") {
      page.redirect(
        config.prefix + ":topic:" + options.topicId + ":" + options.topicTitle
      );
    } else page.redirect(config.prefix + ":start");
  });

  plugin.addURI(
    config.prefix + ":logout:(.*):(.*):(.*)",
    function (page, showAuth, redirectTopicId, redirectTopicTitle) {
      showtime.httpReq(config.urls.login, {
        postdata: {
          logout: 1,
        },
        noFollow: true,
        debug: true,
        headers: {
          Referer: config.urls.base + config.urls.parts.index,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      page.loading = false;
      redirectTo(page, "login", {
        showAuth: showAuth === "true",
        topicId: redirectTopicId,
        topicTitle: redirectTopicTitle,
      });
    }
  );

  plugin.addURI(
    config.prefix + ":captchalogin:(.*):(.*):(.*)",
    function (page, image, capSid, capCodeName) {
      var captchaValue;

      setPageHeader(page, "Ввод капчи для входа");
      page.appendItem("rutracker:start", "video", {
        title: new showtime.RichText("Капча"),
        icon: "http://" + decodeURIComponent(image),
      });

      captchaValue = showtime.textDialog("Введите капчу с картинки", true);

      if (captchaValue && !captchaValue.rejected && captchaValue.input) {
        //captcha OK
        //redirect to login with showing creditentials window
        redirectTo(page, "login", {
          showAuth: true,
          captchaSid: capSid,
          captchaValue: captchaValue.input,
          capCodeName: capCodeName,
        });
      } else {
        redirectTo(page, "login", { showAuth: true });
      }
    }
  );

  plugin.addURI(
    config.prefix + ":captcha:(.*):(.*):(.*)",
    function (page, image, capSid, capCodeName) {
      setPageHeader(page, "Ввод капчи для входа");
      page.appendItem(
        config.prefix +
          ":captchalogin:" +
          image +
          ":" +
          capSid +
          ":" +
          capCodeName,
        "video",
        {
          title: new showtime.RichText("Нажмите, чтобы ввести капчу"),
          icon: "http://" + decodeURIComponent(image),
        }
      );
    }
  );

  function saveUserCookie(multiheaders, areAuthCookies) {
    if (!multiheaders) return;

    var cookieToSet =
      multiheaders["Set-Cookie"] || multiheaders["set-cookie"] || [];

    for (i = 0; i < cookieToSet.length; i++) {
      var cookie = cookieToSet[i];
      if (!areAuthCookies || config.regExps.userCookie.test(cookie)) {
        service.userCookie = cookie.split(";")[0] + ";";
      }
    }
  }

  function performLogin() {
    var credentials = plugin.getAuthCredentials(
        plugin.getDescriptor().synopsis,
        "Login required",
        false
      ),
      response,
      result;
    if (credentials.rejected) return false; //rejected by user
    if (credentials) {
      response = showtime.httpReq(config.urls.login, {
        postdata: {
          login_username: credentials.username,
          login_password: credentials.password,
          login: encodeURIComponent("Вход"),
        },
        noFollow: true,
        headers: {
          Referer: config.urls.base,
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: "",
        },
      });
      saveUserCookie(response.multiheaders, true);
      response = response.toString();
      result = response.match(config.regExps.authFail);
      return !result;
    }
  }

  plugin.addSearcher(
    plugin.getDescriptor().id,
    config.logo,
    function (page, query) {
      var url =
          config.urls.base +
          config.urls.parts.search +
          encodeURIComponent(query) +
          "&o=10",
        nextURL,
        tryToSearch = true;

      page.entries = 0;
      loader();
      page.asyncPaginator = loader;

      //this is NOT working yet as intended (seems like finding the next page is broken)
      function loader() {
        var response,
          match,
          dom,
          textContent,
          logofilm,
          html = require("showtime/html");
        if (!tryToSearch) {
          return page.haveMore(false);
        }
        page.loading = true;
        topicCount = 0;
        response = showtime
          .httpReq(url, {
            headers: config.headers,
          })
          .toString();
        dom = html.parse(response);
        page.loading = false;
        //perform background login if login form has been found on the page
        if (response.match(config.regExps.authFail)) {
          if (!performLogin()) {
            //do not perform the search if the background login has failed
            return page.haveMore(false);
          }
        }

        match = makeDescription(response);
        //проходимся по найденным темам
        while (match && match.title !== "") {
          topicCount++;
          if (/720/.test(match.title)) {
            logofilm = plugin.path + "720.png";
          } else if (/1080/.test(match.title)) {
            logofilm = plugin.path + "1080.png";
          } else if (/2160/.test(match.title)) {
            logofilm = plugin.path + "4k.png";
          } else {
            logofilm = plugin.path + "none.png";
          }
          page.appendItem(
            config.prefix +
              ":topic:" +
              match.topicId +
              ":" +
              encodeURIComponent(match.title),
            "directory",
            {
              title: new showtime.RichText(topicCount + " | " + match.title),
              icon: logofilm,
            }
          );
          page.entries++;
          match = makeDescription(response);
        }
        try {
          nextURL = dom.root
            .getElementByClassName("bottom_info")[0]
            .getElementByClassName("pg");
          nextURL = nextURL[nextURL.length - 1];
          textContent = nextURL.textContent;
          nextURL = nextURL.attributes.getNamedItem("href").value;

          if (!nextURL || textContent !== "След.") {
            return page.haveMore(false);
          } else {
            url = config.urls.base + nextURL;
            return page.haveMore(true);
          }
        } catch (err) {
          return page.haveMore(true);
        }
      }

      function makeDescription(response) {
        var result = {
            title: "",
            href: "",
            topicId: "",
            size: "0",
            seeders: "0",
            leechers: "0",
          },
          //1-номер темы, 2-относительная ссылка на тему, 3-название
          nameMatch = config.regExps.search.name.exec(response),
          //1-размер, 2-сидеры, 3-личеры
          infoMatch = config.regExps.search.info.exec(response);

        if (nameMatch) {
          result.title = nameMatch[3];
          result.href = nameMatch[2];
          result.topicId = nameMatch[1];
        }
        if (infoMatch) {
          result.size = infoMatch[1];
          result.seeders = infoMatch[2];
          result.leechers = infoMatch[3];
        }
        //сформируем готовую строку с описанием торрента
        result.description =
          coloredStr("Название: ", config.colors.orange) +
          result.title +
          "<br>";
        //result.description += coloredStr('Размер: ', config.colors.blue) + result.size + "<br>";
        //result.description += coloredStr('Сидеры: ', config.colors.green) + result.seeders + "<br>";
        //result.description += coloredStr('Личеры: ', config.colors.red) + result.leechers + "<br>";
        result.description = new showtime.RichText(result.description);

        result.titleExtended = "";
        //result.titleExtended += coloredStr(result.size, config.colors.blue) + " (";
        //result.titleExtended += coloredStr(result.seeders, config.colors.green) + "/";
        //result.titleExtended += coloredStr(result.leechers, config.colors.red)  + ")";
        result.titleExtended += result.title;
        result.titleExtended = new showtime.RichText(result.titleExtended);
        return result;
      }
    }
  );
})(this);
