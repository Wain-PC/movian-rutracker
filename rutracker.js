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
            blue: '6699CC',
            orange: 'FFA500',
            red: 'EE0000',
            green: '008B45'
        }
    };

    var service = plugin.createService(config.pluginInfo.title, config.prefix + ":start", "video", true, config.logo);
    var settings = plugin.createSettings(config.pluginInfo.title, config.logo, config.pluginInfo.synopsis);
    settings.createInfo("info", config.logo, "Plugin developed by " + config.pluginInfo.author + ". \n");
    settings.createDivider('Settings');
    settings.createString("domain", "Домен", "rutracker.org", function (v) {
        service.domain = v;
    });

    settings.createString("userCookie", "Cookie пользователя", "DONT_TOUCH_THIS", function (v) {
        service.userCookie = v;
    });

    config.urls = {
        base: 'http://' + service.domain + '/forum/',
        login: 'http://login.' + service.domain + '/forum/login.php',
        download: 'http://dl.' + service.domain + '/forum/dl.php?t='
    };

    function coloredStr(str, color) {
        return '<font color="' + color + '">' + str + '</font>';
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


    //Start page
    //There's a list of all forums and subforums being shown
    plugin.addURI(config.prefix + ":start", function (page) {
        var doc,
            reLogin,
            loginState,
            re, mainSubforum, re2, forumItem, forumTitle;
        setPageHeader(page, config.pluginInfo.synopsis);
        page.loading = true;
        doc = showtime.httpReq(config.urls.base + 'index.php');
        doc.convertFromEncoding('windows-1251').toString();
        page.loading = false;

        //check for LOGIN state
        reLogin = /Вы зашли как:[\s\S]*?<b class="med">([\s\S]*?)<\/b>/g;
        loginState = reLogin.exec(doc);
        if (!loginState) {
            page.redirect(config.prefix + ':login:false');
            return;
        }
        else {
            saveUserCookie(doc.headers);
            if (!(service.userCookie.match(/bb_data/))) {
                page.redirect(config.prefix + ":logout:false:null");
            }

            page.appendItem(config.prefix + ":logout:true:null", "directory", {
                title: new showtime.RichText("Выйти из аккаунта " + loginState[1])

            });

        }


        re = /<h3 class="cat_title"><a href=".*?">([\s\S]*?)<\/a><\/h3>([\s\S]*?)<\/table>/g;
        //1-title, 2- HTML contents
        mainSubforum = re.exec(doc);
        re2 = /<h4 class="forumlink"><a href="viewforum\.php\?f=([\s\S]{0,200}?)">([\s\S]*?)<\/a><\/h4>/g;
        while (mainSubforum) {
            page.appendItem("", "separator", {
                title: mainSubforum[1]
            });
            // 1-forumId, 2 - title
            forumItem = re2.exec(mainSubforum[2]);
            while (forumItem) {
                forumTitle = forumItem[2];
                page.appendItem(config.prefix + ":forum:" + forumItem[1] + ':0:' + encodeURIComponent(forumTitle), "directory", {
                    title: new showtime.RichText(forumTitle)
                });
                forumItem = re2.exec(mainSubforum[2]);
            }

            mainSubforum = re.exec(doc);
        }
    });

    //Subforums page. This may contain a list of nested subforums and a list of topics
    plugin.addURI(config.prefix + ":forum:(.*):(.*):(.*)", function (page, forumId, forumPage, forumTitle) {
        var reSubforum = /<h4 class="forumlink"><a href="viewforum\.php\?f=([\s\S]{0,200}?)">([\s\S]*?)<\/a><\/h4>/g,
            reTopic = /href="viewtopic\.php\?t=([\d]{0,200}?)" class="[\s\S]*?">([\s\S]*?)<\/a>/g,
            forumItem,
            topicItem,
            topicTitle,
            url = config.urls.base + 'viewforum.php?f=' + forumId,
            pageNum = 0;

        subforumLoader();
        setPageHeader(page, decodeURIComponent(forumTitle));
        page.paginator = subforumLoader;

        function subforumLoader() {
            var response, dom, nextURL, textContent,
                html = require('showtime/html');
            page.loading = true;
            response = showtime.httpReq(url).convertFromEncoding('windows-1251').toString();
            dom = html.parse(response);
            page.loading = false;
            pageNum++;

            //searching for SUBFORUMS
            forumItem = reSubforum.exec(response);
            if (forumItem && pageNum === 1) {
                page.appendItem("", "separator", {
                    title: "Форумы"
                });
            }

            while (forumItem) {
                forumTitle = forumItem[2];
                page.appendItem(config.prefix + ":forum:" + forumItem[1] + ':0:' + encodeURIComponent(forumTitle), "directory", {
                    title: new showtime.RichText(forumTitle)
                });
                forumItem = reSubforum.exec(response);
            }

            //SUBFORUMS ended, add separator

            //searching for TOPICS.
            //1-topicId, 2-topicTitle
            topicItem = reTopic.exec(response);
            if (topicItem && pageNum === 1) {
                page.appendItem("", "separator", {
                    title: "Темы"
                });
            }
            while (topicItem) {
                topicTitle = topicItem[2];
                //отсеем те темы, которые называются "1". Это не темы на самом деле, а ссылки для перехода на страницу темы,
                //типа "Стр. 1"
                if (topicTitle !== '1') {
                    page.appendItem(config.prefix + ":topic:" + topicItem[1] + ':' + encodeURIComponent(topicTitle), "directory", {
                        title: new showtime.RichText(topicTitle)
                    });
                }
                topicItem = reTopic.exec(response);
            }

            //try to get the link to the next page
            //pg-jump-menu
            try {
                nextURL = dom.root.getElementByClassName('bottom_info')[0].getElementByClassName('pg');
                nextURL = nextURL[nextURL.length - 1];
                textContent = nextURL.textContent;
                nextURL = nextURL.attributes.getNamedItem('href').value;

                if (!nextURL || textContent !== "След.") {
                    return false;
                }
                else {
                    url = config.urls.base + nextURL;
                    return true;
                }
            }
            catch (err) {
                return false;
            }
        }
    });


    //subforums
    plugin.addURI(config.prefix + ":topic:(.*):(.*)", function (page, topicId, topicTitle) {
        var http, x, doc, reDlLink, dlLink, str;
        page.loading = true;
        setPageHeader(page, decodeURIComponent(topicTitle));
        //проверяем куки, если нет, то нужно перелогиниться или залогиниться, используя сохраненные данные
        if (!(service.userCookie.match(/bb_data/))) {
            page.redirect(config.prefix + ":logout:false:" + topicId);
            return false;
        }

        doc = showtime.httpReq(config.urls.base + 'viewtopic.php?t=' + topicId);
        page.loading = false;


        reDlLink = /dl\.rutracker\.org\/forum\/dl.php\?t=(\d{0,10})/g;
        dlLink = reDlLink.exec(doc);
        if (dlLink) dlLink = dlLink[1];
        else {
            page.error("В теме не найдена ссылка на .torrent");
            return false;
        }

        http = require('showtime/http');
        x = http.request(config.urls.download + dlLink, {
            args: {
                dummy: ""
            },
            headers: {
                Cookie: service.userCookie + ' bb_dl=' + dlLink + ';'
            }
        });
        str = Duktape.enc('base64', x.bytes);
        page.redirect('torrent:browse:data:application/x-bittorrent;base64,' + str);
    });

    //subforums
    plugin.addURI(config.prefix + ":login:(.*)", function (page, showAuth) {
        page.redirect(config.prefix + ":login:" + showAuth + ':null');

    });

    plugin.addURI(config.prefix + ":login:(.*):(.*)", function (page, showAuth, redirectTopicId) {
        //AUTH!
        var showAuthCredentials = false,
            credentials, v, captchaRegExp,
            captchaImageURL, hiddenCaptchaValue, inputName;
        if (showAuth == 'true') showAuthCredentials = true;
        while (1) {
            credentials = plugin.getAuthCredentials(plugin.getDescriptor().synopsis, "Login required", showAuthCredentials);
            if (credentials.rejected) return; //rejected by user
            if (credentials) {
                page.loading = true;
                v = showtime.httpReq(config.urls.login, {
                    postdata: {
                        'login_username': credentials.username,
                        'login_password': credentials.password,
                        'login': encodeURIComponent('Вход')
                    },
                    noFollow: true,
                    headers: {
                        'Referer': config.urls.base,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Cookie': ''
                    }
                });
                page.loading = false;
                saveUserCookie(v.headers);
                captchaRegExp = /<div><img src="(.*?)"[.\w\W]*?<input type="hidden" name="cap_sid" value="(.*?)">[.\w\W]*?<input type="text" name="(.*?)"/g;
                captchaRegExp = captchaRegExp.exec(v);
                if (captchaRegExp) {
                    captchaImageURL = captchaRegExp[1];
                    hiddenCaptchaValue = captchaRegExp[2];
                    inputName = captchaRegExp[3];
                    page.redirect(config.prefix + ":captcha:" + credentials.username + ":" + encodeURIComponent(credentials.password) + ":" + encodeURIComponent(captchaImageURL) + ":" + hiddenCaptchaValue + ":" + inputName);
                    break;
                }
                v = v.toString();
                showAuthCredentials = v.match(/<div class="logintext">/);
                if (!showAuthCredentials) break;
            }
            showAuthCredentials = true;
        }

        //AUTH END
        if (redirectTopicId !== 'null') {
            page.redirect(config.prefix + ":topic:" + redirectTopicId + ":Производится вход");
        }
        else page.redirect(config.prefix + ':start');

    });


    plugin.addURI(config.prefix + ":logout:(.*):(.*)", function (page, showAuth, redirectTopicId) {
        showtime.httpReq(config.urls.login, {
            postdata: {
                'logout': 1
            },
            noFollow: true,
            headers: {
                'Referer': config.urls.base + 'index.php',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        page.loading = false;
        page.redirect(config.prefix + ":login:" + showAuth + ":" + redirectTopicId);
    });


    plugin.addURI(config.prefix + ":captcha:(.*):(.*):(.*):(.*):(.*)", function (page, login, password, image, cap_sid, cap_code_name) {
        var captchaValue, requestSettings, v, loginFail;
        password = decodeURIComponent(password);
        image = decodeURIComponent(image);
        setPageHeader(page, "Ввод капчи для входа");
        page.appendItem(config.prefix + ':captchalogin', "video", {
            title: new showtime.RichText("Введите капчу для входа"),
            icon: image
        });
        captchaValue = showtime.textDialog("Введите капчу с картинки", true);

        if (captchaValue && !captchaValue.rejected && captchaValue.input) {
            //captcha OK, send the request
            page.loading = true;
            requestSettings = {
                postdata: {
                    'redirect': 'index.php',
                    'login_username': login,
                    'login_password': password,
                    'cap_sid': cap_sid,
                    'login': encodeURIComponent('Вход')
                },
                noFollow: true,
                headers: {
                    'Referer': config.urls.base,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            requestSettings.postdata[cap_code_name] = captchaValue.input;

            v = showtime.httpReq(config.urls.login, requestSettings);
            page.loading = false;
            headers = v.headers;
            saveUserCookie(headers);
            v = v.toString();
            loginFail = v.match(/<h4 class="warnColor1 tCenter mrg_16">/);
            if (!loginFail) page.redirect(config.prefix + ":start");
            else page.redirect(config.prefix + ":login:true");

        }
        else {
            page.redirect(config.prefix + ":login:true");
        }

    });

    function saveUserCookie(headers) {
        var cookie;
        if (!headers) return false;
        cookie = headers['Set-Cookie'];
        if (cookie) {
            service.userCookie = cookie.split(';')[0] + ';';
        }
    }


    plugin.addSearcher(plugin.getDescriptor().id, config.logo, function (page, query) {
        var url = config.urls.base + "tracker.php?nm=" + encodeURIComponent(query),
            nextURL,
        //1-размер, 2-сидеры, 3-личеры
            infoRe = /<a class="small tr-dl dl-stub" href=".*?">(.*) &#8595;<\/a>[\W\w.]*?<b class="seedmed">(\d{0,10})<\/b>[\W\w.]*?title="Личи"><b>(\d{0,10})<\/b>/gm,
        //1-номер темы, 2-относительная ссылка на тему, 3-название
            nameRe = /<a data-topic_id="(\d{0,10})".*?href="(.*)">(.*)<\/a>/g;

        page.entries = 0;
        loader();
        page.paginator = loader;

        //this is NOT working yet as intended (seems like finding the next page is broken)
        function loader() {
            var response, match, dom, textContent,
                html = require('showtime/html');
            page.loading = true;
            response = showtime.httpReq(url).toString();
            dom = html.parse(response);
            page.loading = false;
            match = makeDescription(response);
            //проходимся по найденным темам
            while (match && match.title !== "") {
                page.appendItem(config.prefix + ":topic:" + match.topicId + ":" + encodeURIComponent(match.title), "video", {
                    title: new showtime.RichText(match.title),
                    description: match.description
                });
                page.entries++;
                match = makeDescription(response);
            }
            try {
                nextURL = dom.root.getElementByClassName('bottom_info')[0].getElementByClassName('pg');
                nextURL = nextURL[nextURL.length - 1];
                textContent = nextURL.textContent;
                nextURL = nextURL.attributes.getNamedItem('href').value;

                if (!nextURL || textContent !== "След.") {
                    return false;
                }
                else {
                    url = config.urls.base + nextURL;
                    return true;
                }
            }
            catch (err) {
                return false;
            }
            return true;
        }


        function makeDescription(response) {
            var result = {
                    title: "",
                    href: "",
                    topicId: "",
                    size: "0",
                    seeders: "0",
                    leechers: "0"
                },
                nameMatch = nameRe.exec(response),
                infoMatch = infoRe.exec(response);

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
            result.description = coloredStr('Название: ', config.colors.orange) + result.title + "<br>";
            result.description += coloredStr('Размер: ', config.colors.blue) + result.size + "<br>";
            result.description += coloredStr('Сидеры: ', config.colors.green) + result.seeders + "<br>";
            result.description += coloredStr('Личеры: ', config.colors.red) + result.leechers + "<br>";
            result.description = new showtime.RichText(result.description);
            return result;
        }

    });


})(this);