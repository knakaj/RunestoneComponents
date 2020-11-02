/**
 *
 * Created by bmiller on 3/19/15.
 */
"use strict";

import RunestoneBase from "../../common/js/runestonebase.js";
import AudioTour from "./audiotour";
import "./activecode-i18n.en";
import CodeMirror from "codemirror";
import "codemirror/mode/python/python.js";
import "codemirror/mode/css/css.js";
import "codemirror/mode/htmlmixed/htmlmixed.js";
import "codemirror/mode/xml/xml.js";
import "codemirror/mode/javascript/javascript.js";
import "codemirror/mode/sql/sql.js";
import "codemirror/mode/clike/clike.js";
import "codemirror/mode/octave/octave.js";
import "./activecode-i18n.en.js";
import "./../css/activecode.css";
import "codemirror/lib/codemirror.css";

var isMouseDown = false;
document.onmousedown = function () {
    isMouseDown = true;
};

document.onmouseup = function () {
    isMouseDown = false;
};
window.edList = {};

var socket, connection, doc;
var chatcodesServer = "chat.codes";

// separate into constructor and init
export class ActiveCode extends RunestoneBase {
    constructor(opts) {
        super(opts);
        var suffStart;
        var orig = $(opts.orig).find("textarea")[0];
        this.useRunestoneServices = opts.useRunestoneServices;
        this.python3 = opts.python3;
        this.alignVertical = opts.vertical;
        this.origElem = orig;
        this.divid = opts.orig.id;
        this.code = $(orig).text() || "\n\n\n\n\n";
        this.language = $(orig).data("lang");
        this.timelimit = $(orig).data("timelimit");
        this.includes = $(orig).data("include");
        this.hidecode = $(orig).data("hidecode");
        this.chatcodes = $(orig).data("chatcodes");
        this.hidehistory = $(orig).data("hidehistory");
        this.tie = $(orig).data("tie");
        this.dburl = $(orig).data("dburl");
        this.runButton = null;
        this.enabledownload = $(orig).data("enabledownload");
        this.downloadButton = null;
        this.saveButton = null;
        this.loadButton = null;
        this.outerDiv = null;
        this.partner = "";
        if (!eBookConfig.allow_pairs || $(orig).data("nopair")) {
            this.enablePartner = false;
        } else {
            this.enablePartner = true;
        }
        this.output = null; // create pre for output
        this.graphics = null; // create div for turtle graphics
        this.codecoach = null;
        this.codelens = null;
        this.controlDiv = null;
        this.historyScrubber = null;
        this.timestamps = ["Original"];
        this.autorun = $(orig).data("autorun");
        if (this.chatcodes && eBookConfig.enable_chatcodes) {
            if (!socket) {
                socket = new WebSocket("wss://" + chatcodesServer);
            }
            if (!connection) {
                connection = new window.sharedb.Connection(socket);
            }
            if (!doc) {
                doc = connection.get("chatcodes", "channels");
            }
        }
        if (this.graderactive) {
            this.hidecode = false;
        }
        if (this.includes !== undefined) {
            this.includes = this.includes.split(/\s+/);
        }
        suffStart = this.code.indexOf("====");
        if (suffStart > -1) {
            this.suffix = this.code.substring(suffStart + 5);
            this.code = this.code.substring(0, suffStart);
        }
        this.history = [this.code];
        this.createEditor();
        this.createOutput();
        this.createControls();
        if ($(orig).data("caption")) {
            this.caption = $(orig).data("caption");
        } else {
            this.caption = "ActiveCode";
        }
        this.addCaption("runestone");
        if (this.autorun) {
            $(document).ready(this.runProg.bind(this));
        }
    }

    createEditor(index) {
        this.containerDiv = document.createElement("div");
        var linkdiv = document.createElement("div");
        linkdiv.id = this.divid.replace(/_/g, "-").toLowerCase(); // :ref: changes _ to - so add this as a target
        $(this.containerDiv).addClass("ac_section alert alert-warning");
        var codeDiv = document.createElement("div");
        $(codeDiv).addClass("ac_code_div col-md-12");
        this.codeDiv = codeDiv;
        this.containerDiv.id = this.divid;
        this.containerDiv.lang = this.language;
        this.outerDiv = this.containerDiv;
        $(this.origElem).replaceWith(this.containerDiv);
        if (linkdiv.id !== this.divid) {
            // Don't want the 'extra' target if they match.
            this.containerDiv.appendChild(linkdiv);
        }
        this.containerDiv.appendChild(codeDiv);
        var edmode = this.containerDiv.lang;
        if (edmode === "sql") {
            edmode = "text/x-sql";
        } else if (edmode === "java") {
            edmode = "text/x-java";
        } else if (edmode === "cpp") {
            edmode = "text/x-c++src";
        } else if (edmode === "c") {
            edmode = "text/x-csrc";
        } else if (edmode === "python3") {
            edmode = "python";
        } else if (edmode === "octave" || edmode === "MATLAB") {
            edmode = "text/x-octave";
        }
        var editor = CodeMirror(codeDiv, {
            value: this.code,
            lineNumbers: true ? !this.isTimed : false,
            mode: edmode,
            indentUnit: 4,
            matchBrackets: true,
            autoMatchParens: true,
            extraKeys: {
                Tab: "indentMore",
                "Shift-Tab": "indentLess",
            },
        });
        // Make the editor resizable
        $(editor.getWrapperElement()).resizable({
            resize: function () {
                editor.setSize($(this).width(), $(this).height());
                editor.refresh();
            },
        });
        // give the user a visual cue that they have changed but not saved
        editor.on(
            "change",
            function (ev) {
                if (
                    editor.acEditEvent == false ||
                    editor.acEditEvent === undefined
                ) {
                    // change events can come before any real changes for various reasons, some unknown
                    // this avoids unneccsary log events and updates to the activity counter
                    if (this.origElem.textContent === editor.getValue()) {
                        return;
                    }
                    $(editor.getWrapperElement()).css(
                        "border-top",
                        "2px solid #b43232"
                    );
                    $(editor.getWrapperElement()).css(
                        "border-bottom",
                        "2px solid #b43232"
                    );
                    this.logBookEvent({
                        event: "activecode",
                        act: "edit",
                        div_id: this.divid,
                    });
                }
                editor.acEditEvent = true;
            }.bind(this)
        ); // use bind to preserve *this* inside the on handler.
        //Solving Keyboard Trap of ActiveCode: If user use tab for navigation outside of ActiveCode, then change tab behavior in ActiveCode to enable tab user to tab out of the textarea
        $(window).keydown(function (e) {
            var code = e.keyCode ? e.keyCode : e.which;
            if (code == 9 && $("textarea:focus").length === 0) {
                editor.setOption("extraKeys", {
                    Tab: function (cm) {
                        $(document.activeElement)
                            .closest(".tab-content")
                            .nextSibling.focus();
                    },
                    "Shift-Tab": function (cm) {
                        $(document.activeElement)
                            .closest(".tab-content")
                            .previousSibling.focus();
                    },
                });
            }
        });
        this.editor = editor;
        if (this.hidecode) {
            $(this.codeDiv).css("display", "none");
        }
    }
    createControls() {
        var ctrlDiv = document.createElement("div");
        var butt;
        $(ctrlDiv).addClass("ac_actions");
        $(ctrlDiv).addClass("col-md-12");
        // Run
        butt = document.createElement("button");
        $(butt).text($.i18n("msg_activecode_run_code"));
        $(butt).addClass("btn btn-success run-button");
        ctrlDiv.appendChild(butt);
        this.runButton = butt;
        $(butt).click(this.runProg.bind(this));
        $(butt).attr("type", "button");
        if (this.enabledownload || eBookConfig.downloadsEnabled) {
            butt = document.createElement("button");
            $(butt).text("Download");
            $(butt).addClass("btn save-button");
            ctrlDiv.appendChild(butt);
            this.downloadButton = butt;
            $(butt).click(this.downloadFile.bind(this, this.language));
            $(butt).attr("type", "button");
        }
        if (!this.hidecode && !this.hidehistory) {
            butt = document.createElement("button");
            $(butt).text($.i18n("msg_activecode_load_history"));
            $(butt).addClass("btn btn-default");
            $(butt).attr("type", "button");
            ctrlDiv.appendChild(butt);
            this.histButton = butt;
            $(butt).click(this.addHistoryScrubber.bind(this));
            if (this.graderactive) {
                this.addHistoryScrubber(true);
            }
        }
        if ($(this.origElem).data("gradebutton") && !this.graderactive) {
            butt = document.createElement("button");
            $(butt).addClass("ac_opt btn btn-default");
            $(butt).text($.i18n("msg_activecode_show_feedback"));
            $(butt).css("margin-left", "10px");
            $(butt).attr("type", "button");
            this.gradeButton = butt;
            ctrlDiv.appendChild(butt);
            $(butt).click(this.createGradeSummary.bind(this));
        }
        // Show/Hide Code
        if (this.hidecode) {
            $(this.runButton).attr("disabled", "disabled");
            butt = document.createElement("button");
            $(butt).addClass("ac_opt btn btn-default");
            $(butt).text($.i18n("msg_activecode_show_code"));
            $(butt).css("margin-left", "10px");
            $(butt).attr("type", "button");
            this.showHideButt = butt;
            ctrlDiv.appendChild(butt);
            $(butt).click(
                function () {
                    $(this.codeDiv).toggle();
                    if (this.historyScrubber == null) {
                        this.addHistoryScrubber(true);
                    } else {
                        $(this.historyScrubber.parentElement).toggle();
                    }
                    if (
                        $(this.showHideButt).text() ==
                        $.i18n("msg_activecode_show_code")
                    ) {
                        $(this.showHideButt).text(
                            $.i18n("msg_activecode_hide_code")
                        );
                    } else {
                        $(this.showHideButt).text(
                            $.i18n("msg_activecode_show_code")
                        );
                    }
                    if ($(this.runButton).attr("disabled")) {
                        $(this.runButton).removeAttr("disabled");
                    } else {
                        $(this.runButton).attr("disabled", "disabled");
                    }
                }.bind(this)
            );
        }
        // CodeLens
        if ($(this.origElem).data("codelens") && !this.graderactive) {
            butt = document.createElement("button");
            $(butt).addClass("ac_opt btn btn-default");
            $(butt).text($.i18n("msg_activecode_show_codelens"));
            $(butt).css("margin-left", "10px");
            this.clButton = butt;
            ctrlDiv.appendChild(butt);
            $(butt).click(this.showCodelens.bind(this));
        }
        // TIE
        if (this.tie) {
            butt = document.createElement("button");
            $(butt).addClass("ac_opt btn btn-default");
            $(butt).text("Open Code Coach");
            this.tieButt = butt;
            ctrlDiv.appendChild(butt);
            $(butt).click(this.showTIE.bind(this));
        }
        // CodeCoach
        // bnm - disable code coach until it is revamped  2017-7-22
        // if (this.useRunestoneServices && $(this.origElem).data("coach")) {
        //     butt = document.createElement("button");
        //     $(butt).addClass("ac_opt btn btn-default");
        //     $(butt).text("Code Coach");
        //     $(butt).css("margin-left", "10px");
        //     this.coachButton = butt;
        //     ctrlDiv.appendChild(butt);
        //     $(butt).click(this.showCodeCoach.bind(this));
        // }
        // Audio Tour
        if ($(this.origElem).data("audio")) {
            butt = document.createElement("button");
            $(butt).addClass("ac_opt btn btn-default");
            $(butt).text($.i18n("msg_activecode_audio_tour"));
            $(butt).css("margin-left", "10px");
            this.atButton = butt;
            ctrlDiv.appendChild(butt);
            $(butt).click(
                function () {
                    new AudioTour(
                        this.divid,
                        this.code,
                        1,
                        $(this.origElem).data("audio")
                    );
                }.bind(this)
            );
        }
        if (eBookConfig.isInstructor) {
            let butt = document.createElement("button");
            $(butt).addClass("btn btn-info");
            $(butt).text("Share Code");
            $(butt).css("margin-left", "10px");
            this.shareButt = butt;
            ctrlDiv.appendChild(butt);
            $(butt).click(
                function () {
                    if (
                        !confirm(
                            "You are about to share this code with ALL of your students.  Are you sure you want to continue?"
                        )
                    ) {
                        return;
                    }
                    let data = {
                        divid: this.divid,
                        code: this.editor.getValue(),
                        lang: this.language,
                    };
                    $.post(
                        "/runestone/ajax/broadcast_code.json",
                        data,
                        function (status) {
                            if (status.mess === "success") {
                                alert(
                                    `Shared Code with ${status.share_count} students`
                                );
                            } else {
                                alert("Sharing Failed");
                            }
                        },
                        "json"
                    );
                }.bind(this)
            );
        }
        if (this.enablePartner) {
            var checkPartner = document.createElement("input");
            checkPartner.type = "checkbox";
            checkPartner.id = `${this.divid}_part`;
            ctrlDiv.appendChild(checkPartner);
            var plabel = document.createElement("label");
            plabel.for = `${this.divid}_part`;
            $(plabel).text("Pair?");
            ctrlDiv.appendChild(plabel);
            $(checkPartner).click(
                function () {
                    if (this.partner) {
                        this.partner = false;
                        $(partnerTextBox).hide();
                        this.partner = "";
                        partnerTextBox.value = "";
                        $(plabel).text("Pair?");
                    } else {
                        let didAgree = localStorage.getItem("partnerAgree");
                        if (!didAgree) {
                            didAgree = confirm(
                                "Pair Programming should only be used with the consent of your instructor." +
                                    "Your partner must be a registered member of the class and have agreed to pair with you." +
                                    "By clicking OK you certify that both of these conditions have been met."
                            );
                            if (didAgree) {
                                localStorage.setItem("partnerAgree", "true");
                            } else {
                                return;
                            }
                        }
                        this.partner = true;
                        $(plabel).text("with: ");
                        $(partnerTextBox).show();
                    }
                }.bind(this)
            );
            var partnerTextBox = document.createElement("input");
            partnerTextBox.type = "text";
            ctrlDiv.appendChild(partnerTextBox);
            $(partnerTextBox).hide();
            $(partnerTextBox).change(
                function () {
                    this.partner = partnerTextBox.value;
                }.bind(this)
            );
        }
        if (this.chatcodes && eBookConfig.enable_chatcodes) {
            var chatBar = document.createElement("div");
            var channels = document.createElement("span");
            var topic = window.location.host + "-" + this.divid;
            ctrlDiv.appendChild(chatBar);
            $(chatBar).text("Chat: ");
            $(chatBar).append(channels);
            butt = document.createElement("a");
            $(butt).addClass("ac_opt btn btn-default");
            $(butt).text("Create Channel");
            $(butt).css("margin-left", "10px");
            $(butt).attr("type", "button");
            $(butt).attr("target", "_blank");
            $(butt).attr(
                "href",
                "http://" +
                    chatcodesServer +
                    "/new?" +
                    $.param({
                        topic: window.location.host + "-" + this.divid,
                        code: this.editor.getValue(),
                        lang: "Python",
                    })
            );
            this.chatButton = butt;
            chatBar.appendChild(butt);
            var updateChatCodesChannels = function () {
                var data = doc.data;
                var i = 1;
                $(channels).html("");
                data["channels"].forEach(function (channel) {
                    if (!channel.archived && topic === channel.topic) {
                        var link = $("<a />");
                        var href =
                            "http://" +
                            chatcodesServer +
                            "/" +
                            channel.channelName;
                        link.attr({
                            href: href,
                            target: "_blank",
                        });
                        link.text(" " + channel.channelName + "(" + i + ") ");
                        $(channels).append(link);
                        i++;
                    }
                });
                if (i === 1) {
                    $(channels).text(
                        "(no active converstations on this problem)"
                    );
                }
            };
            doc.subscribe(updateChatCodesChannels);
            doc.on("op", updateChatCodesChannels);
        }
        $(this.outerDiv).prepend(ctrlDiv);
        this.controlDiv = ctrlDiv;
    }
    enableSaveLoad() {
        $(this.runButton).text($.i18n("msg_activecode_save_run"));
    }
    // Activecode -- If the code has not changed wrt the scrubber position value then don't save the code or reposition the scrubber
    //  -- still call runlog, but add a parameter to not save the code
    // add an initial load history button
    // if there is no edit then there is no append   to_save (True/False)
    addHistoryScrubber(pos_last) {
        var data = {
            acid: this.divid,
        };
        var deferred = jQuery.Deferred();
        if (this.sid !== undefined) {
            data["sid"] = this.sid;
        }
        console.log("before get hist");
        var helper = function () {
            console.log("making a new scrubber");
            var scrubberDiv = document.createElement("div");
            $(scrubberDiv).css("display", "inline-block");
            $(scrubberDiv).css("margin-left", "10px");
            $(scrubberDiv).css("margin-right", "10px");
            $(scrubberDiv).css({
                "min-width": "200px",
                "max-width": "300px",
            });
            var scrubber = document.createElement("div");
            this.timestampP = document.createElement("span");
            this.slideit = function () {
                this.editor.setValue(this.history[$(scrubber).slider("value")]);
                var curVal = this.timestamps[$(scrubber).slider("value")];
                let pos = $(scrubber).slider("value");
                let outOf = this.history.length;
                $(this.timestampP).text(`${curVal} - ${pos + 1} of ${outOf}`);
                this.logBookEvent({
                    event: "activecode",
                    act: "slide:" + curVal,
                    div_id: this.divid,
                });
            };
            $(scrubber).slider({
                max: this.history.length - 1,
                value: this.history.length - 1,
            });
            $(scrubber).css("margin", "10px");
            $(scrubber).on("slide", this.slideit.bind(this));
            $(scrubber).on("slidechange", this.slideit.bind(this));
            scrubberDiv.appendChild(scrubber);
            scrubberDiv.appendChild(this.timestampP);
            // If there is a deadline set then position the scrubber at the last submission
            // prior to the deadline
            if (this.deadline) {
                let i = 0;
                let done = false;
                while (i < this.history.length && !done) {
                    if (new Date(this.timestamps[i]) > this.deadline) {
                        done = true;
                    } else {
                        i += 1;
                    }
                }
                i = i - 1;
                scrubber.value = Math.max(i, 0);
                this.editor.setValue(this.history[scrubber.value]);
                $(scrubber).slider("value", scrubber.value);
            } else if (pos_last) {
                scrubber.value = this.history.length - 1;
                this.editor.setValue(this.history[scrubber.value]);
            } else {
                scrubber.value = 0;
            }
            let pos = $(scrubber).slider("value");
            let outOf = this.history.length;
            let ts = this.timestamps[$(scrubber).slider("value")];
            $(this.timestampP).text(`${ts} - ${pos + 1} of ${outOf}`);
            $(this.histButton).remove();
            this.histButton = null;
            this.historyScrubber = scrubber;
            $(scrubberDiv).insertAfter(this.runButton);
            deferred.resolve();
        }.bind(this); // end definition of helper

        if (
            eBookConfig.practice_mode ||
            (this.isTimed && !this.assessmentTaken)
        ) {
            // If this is timed and already taken we should restore history info
            helper();
        } else {
            jQuery
                .getJSON(
                    eBookConfig.ajaxURL + "gethist.json",
                    data,
                    function (data, status, whatever) {
                        if (data.history !== undefined) {
                            this.history = this.history.concat(data.history);
                            for (let t in data.timestamps) {
                                this.timestamps.push(
                                    new Date(
                                        data.timestamps[t]
                                    ).toLocaleString()
                                );
                            }
                        }
                    }.bind(this)
                )
                .always(helper); // For an explanation, please look at https://stackoverflow.com/questions/336859/var-functionname-function-vs-function-functionname
        }
        return deferred;
    }
    createOutput() {
        // Create a parent div with two elements:  pre for standard output and a div
        // to hold turtle graphics output.  We use a div in case the turtle changes from
        // using a canvas to using some other element like svg in the future.
        var outDiv = document.createElement("div");
        $(outDiv).addClass("ac_output col-md-12");
        this.outDiv = outDiv;
        this.output = document.createElement("pre");
        this.output.id = this.divid + "_stdout";
        $(this.output).css("visibility", "hidden");
        this.graphics = document.createElement("div");
        this.graphics.id = this.divid + "_graphics";
        $(this.graphics).addClass("ac-canvas");
        // This bit of magic adds an event which waits for a canvas child to be created on our
        // newly created div.  When a canvas child is added we add a new class so that the visible
        // canvas can be styled in CSS.  Which a the moment means just adding a border.
        $(this.graphics).on(
            "DOMNodeInserted",
            "canvas",
            function (e) {
                $(this.graphics).addClass("visible-ac-canvas");
            }.bind(this)
        );
        var clearDiv = document.createElement("div");
        $(clearDiv).css("clear", "both"); // needed to make parent div resize properly
        this.outerDiv.appendChild(clearDiv);
        outDiv.appendChild(this.output);
        outDiv.appendChild(this.graphics);
        this.outerDiv.appendChild(outDiv);
        var lensDiv = document.createElement("div");
        lensDiv.id = `${this.divid}_codelens`;
        $(lensDiv).addClass("col-md-12");
        $(lensDiv).css("display", "none");
        this.codelens = lensDiv;
        this.outerDiv.appendChild(lensDiv);
        var coachDiv = document.createElement("div");
        $(coachDiv).addClass("col-md-12");
        $(coachDiv).css("display", "none");
        this.codecoach = coachDiv;
        this.outerDiv.appendChild(coachDiv);
        clearDiv = document.createElement("div");
        $(clearDiv).css("clear", "both"); // needed to make parent div resize properly
        this.outerDiv.appendChild(clearDiv);
    }
    disableSaveLoad() {
        $(this.saveButton).addClass("disabled");
        $(this.saveButton).attr("title", "Login to save your code");
        $(this.loadButton).addClass("disabled");
        $(this.loadButton).attr("title", "Login to load your code");
    }
    downloadFile(lang) {
        var fnb = this.divid;
        var d = new Date();
        var fileName =
            fnb +
            "_" +
            d
                .toJSON()
                .substring(0, 10) // reverse date format
                .split("-")
                .join("") +
            "." +
            languageExtensions[lang];
        var code = this.editor.getValue();
        if ("Blob" in window) {
            var textToWrite = code.replace(/\n/g, "\r\n");
            var textFileAsBlob = new Blob([textToWrite], {
                type: "text/plain",
            });
            if ("msSaveOrOpenBlob" in navigator) {
                navigator.msSaveOrOpenBlob(textFileAsBlob, fileName);
            } else {
                var downloadLink = document.createElement("a");
                downloadLink.download = fileName;
                downloadLink.innerHTML = "Download File";
                downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
                downloadLink.style.display = "none";
                document.body.appendChild(downloadLink);
                downloadLink.click();
            }
        } else {
            alert("Your browser does not support the HTML5 Blob.");
        }
    }
    loadEditor() {
        var loadEditor = function (data, status, whatever) {
            // function called when contents of database are returned successfully
            var res = eval(data)[0];
            if (res.source) {
                this.editor.setValue(res.source);
                setTimeout(
                    function () {
                        this.editor.refresh();
                    }.bind(this),
                    500
                );
                $(this.loadButton).tooltip({
                    placement: "bottom",
                    title: $.i18n("msg_activecode_loaded_code"),
                    trigger: "manual",
                });
            } else {
                $(this.loadButton).tooltip({
                    placement: "bottom",
                    title: $.i18n("msg_activecode_no_saved_code"),
                    trigger: "manual",
                });
            }
            $(this.loadButton).tooltip("show");
            setTimeout(
                function () {
                    $(this.loadButton).tooltip("destroy");
                }.bind(this),
                4000
            );
        }.bind(this);
        var data = {
            acid: this.divid,
        };
        if (this.sid !== undefined) {
            data["sid"] = this.sid;
        }
        // This function needs to be chainable for when we want to do things like run the activecode
        // immediately after loading the previous input (such as in a timed exam)
        var dfd = jQuery.Deferred();
        this.logBookEvent({
            event: "activecode",
            act: "load",
            div_id: this.divid,
        }); // Log the run event
        jQuery
            .get(eBookConfig.ajaxURL + "getprog", data, loadEditor)
            .done(function () {
                dfd.resolve();
            });
        return dfd;
    }
    createGradeSummary() {
        // get grade and comments for this assignment
        // get summary of all grades for this student
        // display grades in modal window
        var showGradeSummary = function (data, status, whatever) {
            var report = eval(data)[0];
            var body;
            // check for report['message']
            if (report) {
                if (report["version"] == 2) {
                    // new version; would be better to embed this in HTML for the activecode
                    body =
                        "<h4>Grade Report</h4>" +
                        "<p>This question: " +
                        report["grade"];
                    if (report["released"]) {
                        body += " out of " + report["max"];
                    }
                    body += "</p> <p>";
                    if (report["released"] == false) {
                        body += "Preliminary Comments: ";
                    }
                    body += report["comment"] + "</p>";
                } else {
                    body =
                        "<h4>Grade Report</h4>" +
                        "<p>This assignment: " +
                        report["grade"] +
                        "</p>" +
                        "<p>" +
                        report["comment"] +
                        "</p>" +
                        "<p>Number of graded assignments: " +
                        report["count"] +
                        "</p>" +
                        "<p>Average score: " +
                        report["avg"] +
                        "</p>";
                }
            } else {
                body =
                    "<h4>The server did not return any grade information</h4>";
            }
            var html = `<div class="modal fade">
                  <div class="modal-dialog compare-modal">
                    <div class="modal-content">
                      <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                        <h4 class="modal-title">Assignment Feedback</h4>
                      </div>
                      <div class="modal-body">
                        ${body}
                      </div>
                    </div>
                  </div>
                </div>`;
            var el = $(html);
            el.modal();
        };
        var data = {
            div_id: this.divid,
        };
        jQuery.get(
            eBookConfig.ajaxURL + "getassignmentgrade",
            data,
            showGradeSummary
        );
    }
    hideCodelens(button, div_id) {
        this.codelens.style.display = "none";
    }
    showCodelens() {
        if (this.codelens.style.display == "none") {
            this.codelens.style.display = "block";
            this.clButton.innerText = $.i18n("msg_activecode_hide_codelens");
        } else {
            this.codelens.style.display = "none";
            this.clButton.innerText = $.i18n("msg_activecode_show_in_codelens");
            return;
        }
        var cl = this.codelens.firstChild;
        if (cl) {
            this.codelens.removeChild(cl);
        }
        var code = this.buildProg(false);
        var myVars = {};
        myVars.code = code;
        myVars.origin = "opt-frontend.js";
        myVars.cumulative = false;
        myVars.heapPrimitives = false;
        myVars.drawParentPointers = false;
        myVars.textReferences = false;
        myVars.showOnlyOutputs = false;
        myVars.rawInputLstJSON = JSON.stringify([]);
        if (this.language == "python") {
            if (this.python3) {
                myVars.py = 3;
            } else {
                myVars.py = 2;
            }
        } else if (this.langauge == "javascript") {
            myVars.py = "js";
        } else {
            myVars.py = this.language;
        }
        myVars.curInstr = 0;
        myVars.codeDivWidth = 350;
        myVars.codeDivHeight = 400;
        var srcURL = "https://pythontutor.com/iframe-embed.html";
        var srcVars = $.param(myVars);
        var embedUrlStr = `${srcURL}#${srcVars}`;
        var myIframe = document.createElement("iframe");
        myIframe.setAttribute("id", this.divid + "_codelens");
        myIframe.setAttribute("width", "800");
        myIframe.setAttribute("height", "500");
        myIframe.setAttribute("style", "display:block");
        myIframe.style.background = "#fff";
        //myIframe.setAttribute("src",srcURL)
        myIframe.src = embedUrlStr;
        this.codelens.appendChild(myIframe);
        this.logBookEvent({
            event: "codelens",
            act: "view",
            div_id: this.divid,
        });
    }
    // <iframe id="%(divid)s_codelens" width="800" height="500" style="display:block"src="#">
    // </iframe>
    showCodeCoach() {
        var myIframe;
        var srcURL;
        var cl;
        var div_id = this.divid;
        if (this.codecoach === null) {
            this.codecoach = document.createElement("div");
            this.codecoach.style.display = "block";
        }
        cl = this.codecoach.firstChild;
        if (cl) {
            this.codecoach.removeChild(cl);
        }
        srcURL = eBookConfig.app + "/admin/diffviewer?divid=" + div_id;
        myIframe = document.createElement("iframe");
        myIframe.setAttribute("id", div_id + "_coach");
        myIframe.setAttribute("width", "800px");
        myIframe.setAttribute("height", "500px");
        myIframe.setAttribute("style", "display:block");
        myIframe.style.background = "#fff";
        myIframe.style.width = "100%";
        myIframe.src = srcURL;
        this.codecoach.appendChild(myIframe);
        $(this.codecoach).show();
        this.logBookEvent({
            event: "coach",
            act: "view",
            div_id: this.divid,
        });
    }
    showTIE() {
        var tieDiv = document.createElement("div");
        $(this.tieButt).attr("disabled", "disabled");
        $(tieDiv).addClass("tie-container");
        $(tieDiv).data("tie-id", this.divid);
        var ifm = document.createElement("iframe");
        $(ifm).addClass("tie-frame");
        ifm.src = `https://tech-interview-exercises.appspot.com/client/question.html?qid=${this.tie}`;
        var setIframeDimensions = function () {
            $(".tie-container").css(
                "width",
                $(".tie-container").parent().width()
            );
            //    $('.tie-frame').css('width', $('.tie-frame').parent().width() - 120);
        };
        ifm.onload = setIframeDimensions;
        $(function () {
            $(window).resize(setIframeDimensions);
        });
        window.addEventListener(
            "message",
            function (evt) {
                if (
                    evt.origin != "https://tech-interview-exercises.appspot.com"
                ) {
                    return;
                }
                // Handle the event accordingly.
                // evt.data contains the code
                this.logRunEvent({
                    div_id: this.divid,
                    code: JSON.parse(evt.data),
                    lang: this.language,
                    errinfo: "TIEresult",
                    to_save: true,
                    prefix: this.pretext,
                    suffix: this.suffix,
                });
            }.bind(this),
            false
        );
        this.logBookEvent({
            event: "tie",
            act: "open",
            div_id: this.divid,
        });
        tieDiv.appendChild(ifm);
        this.outerDiv.appendChild(tieDiv);
    }
    toggleEditorVisibility() {}
    addErrorMessage(err) {
        // Add the error message
        this.errLastRun = true;
        var errHead = $("<h3>").html("Error");
        this.eContainer = this.outerDiv.appendChild(
            document.createElement("div")
        );
        this.eContainer.className = "error alert alert-danger";
        this.eContainer.id = this.divid + "_errinfo";
        this.eContainer.appendChild(errHead[0]);
        var errText = this.eContainer.appendChild(
            document.createElement("pre")
        );
        // But, adjust the line numbers.  If the line number is <= pretextLines then it is in included code
        // if it is greater than the number of included lines but less than the pretext + current editor then it is in the student code.
        // adjust the line number we display by eliminating the pre-included code.
        if (err.traceback.length >= 1) {
            var errorLine = err.traceback[0].lineno;
            if (errorLine <= this.pretextLines) {
                errText.innerHTML =
                    "An error occurred in the hidden, included code. Sorry we can't give you a more helpful error message";
                return;
            } else if (errorLine > this.progLines + this.pretextLines) {
                errText.innerHTML =
                    "An error occurred after the end of your code. One possible reason is that you have an unclosed parenthesis or string. Another possibility is that there is an error in the hidden test code.";
                return;
            } else {
                if (this.pretextLines > 0) {
                    err.traceback[0].lineno =
                        err.traceback[0].lineno - this.pretextLines + 1;
                }
            }
        }
        var errString = err.toString();
        var to = errString.indexOf(":");
        var errName = errString.substring(0, to);
        errText.innerHTML = errString;
        $(this.eContainer).append("<h3>Description</h3>");
        var errDesc = this.eContainer.appendChild(document.createElement("p"));
        errDesc.innerHTML = errorText[errName];
        $(this.eContainer).append("<h3>To Fix</h3>");
        var errFix = this.eContainer.appendChild(document.createElement("p"));
        errFix.innerHTML = errorText[errName + "Fix"];
        var moreInfo = "../ErrorHelp/" + errName.toLowerCase() + ".html";
        //console.log("Runtime Error: " + err.toString());
    }
    setTimeLimit(timer) {
        var timelimit = this.timelimit;
        if (timer !== undefined) {
            timelimit = timer;
        }
        // set execLimit in milliseconds  -- for student projects set this to
        // 25 seconds -- just less than Chrome's own timer.
        if (
            this.code.indexOf("ontimer") > -1 ||
            this.code.indexOf("onclick") > -1 ||
            this.code.indexOf("onkey") > -1 ||
            this.code.indexOf("setDelay") > -1
        ) {
            Sk.execLimit = null;
        } else {
            if (timelimit === "off") {
                Sk.execLimit = null;
            } else if (timelimit) {
                Sk.execLimit = timelimit;
            } else {
                Sk.execLimit = 25000;
            }
        }
    }
    builtinRead(x) {
        if (
            Sk.builtinFiles === undefined ||
            Sk.builtinFiles["files"][x] === undefined
        )
            throw $.i18n("msg_activecode_file_not_found", x);
        return Sk.builtinFiles["files"][x];
    }
    fileReader(divid) {
        let elem = document.getElementById(divid);
        let data = "";
        let result = "";
        if (elem == null && Sk.builtinFiles.files.hasOwnProperty(divid)) {
            return Sk.builtinFiles["files"][divid];
        } else {
            // try remote file unless it ends with .js or .py -- otherwise we'll ask the server for all
            // kinds of modules that we are trying to import
            if (!(divid.endsWith(".js") || divid.endsWith(".py"))) {
                $.ajax({
                    async: false,
                    url: `/runestone/ajax/get_datafile?course_id=${eBookConfig.course}&acid=${divid}`,
                    success: function (data) {
                        result = JSON.parse(data).data;
                    },
                    error: function (err) {
                        result = null;
                    },
                });
                if (result) {
                    return result;
                }
            }
        }
        if (elem == null && result === null) {
            throw new Sk.builtin.IOError(
                $.i18n("msg_activecode_no_file_or_dir", divid)
            );
        } else {
            if (elem.nodeName.toLowerCase() == "textarea") {
                data = elem.value;
            } else {
                data = elem.textContent;
            }
        }
        return data;
    }
    outputfun(text) {
        // bnm python 3
        var pyStr = function (x) {
            if (x instanceof Array) {
                return "[" + x.join(", ") + "]";
            } else {
                return x;
            }
        };
        var x = text;
        if (!this.python3) {
            if (x.charAt(0) == "(") {
                x = x.slice(1, -1);
                x = "[" + x + "]";
                try {
                    var xl = eval(x);
                    xl = xl.map(pyStr);
                    x = xl.join(" ");
                } catch (err) {}
            }
        }
        $(this.output).css("visibility", "visible");
        text = x;
        text = text
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>");
        return Promise.resolve().then(
            function () {
                setTimeout(
                    function () {
                        $(this.output).append(text);
                    }.bind(this),
                    0
                );
            }.bind(this)
        );
    }

    filewriter(fobj, bytes) {
        let filecomponent = document.getElementById(fobj.name);
        if (!filecomponent) {
            let container = document.createElement("div");
            $(container).addClass("runestone");
            let tab = document.createElement("div");
            $(tab).addClass("datafile_caption");
            tab.innerHTML = `Data file: <code>${fobj.name}</code>`;
            filecomponent = document.createElement("textarea");
            filecomponent.rows = 10;
            filecomponent.cols = 50;
            filecomponent.id = fobj.name;
            $(filecomponent).css("margin-bottom", "5px");
            $(filecomponent).addClass("ac_output");
            container.appendChild(tab);
            container.appendChild(filecomponent);
            this.outerDiv.appendChild(container);
        } else {
            if (fobj.pos$ == 0) {
                $(filecomponent).val("");
            }
        }
        let current = $(filecomponent).val();
        current = current + bytes.v;
        $(filecomponent).val(current);
        $(filecomponent).css("display", "block");
        fobj.pos$ = current.length;
        return current.length;
    }

    getIncludedCode(divid) {
        var result, wresult;
        if (window.edList[divid]) {
            return window.edList[divid].editor.getValue();
        } else {
            wresult = $.ajax({
                async: false,
                url: `/runestone/ajax/get_datafile?course_id=${eBookConfig.course}&acid=${divid}`,
                success: function (data) {
                    result = JSON.parse(data).data;
                },
                error: function (err) {
                    result = null;
                },
            });
            return result;
        }
    }

    buildProg(useSuffix) {
        // assemble code from prefix, suffix, and editor for running.
        var pretext;
        var prog = this.editor.getValue() + "\n";
        this.pretext = "";
        this.pretextLines = 0;
        this.progLines = prog.match(/\n/g).length + 1;
        if (this.includes !== undefined) {
            // iterate over the includes, in-order prepending to prog
            pretext = "";
            for (var x = 0; x < this.includes.length; x++) {
                let iCode = this.getIncludedCode(this.includes[x]);
                pretext = pretext + iCode + "\n";
            }
            this.pretext = pretext;
            if (this.pretext) {
                this.pretextLines = (this.pretext.match(/\n/g) || "").length;
            }
            prog = pretext + prog;
        }
        if (useSuffix && this.suffix) {
            prog = prog + this.suffix;
        }
        return prog;
    }
    manage_scrubber(scrubber_dfd, history_dfd, saveCode) {
        if (this.historyScrubber === null && !this.autorun) {
            scrubber_dfd = this.addHistoryScrubber();
        } else {
            scrubber_dfd = jQuery.Deferred();
            scrubber_dfd.resolve();
        }
        history_dfd = jQuery.Deferred();
        scrubber_dfd
            .done(
                function () {
                    if (
                        this.historyScrubber &&
                        this.history[$(this.historyScrubber).slider("value")] !=
                            this.editor.getValue()
                    ) {
                        saveCode = "True";
                        this.history.push(this.editor.getValue());
                        this.timestamps.push(new Date().toLocaleString());
                        $(this.historyScrubber).slider(
                            "option",
                            "max",
                            this.history.length - 1
                        );
                        $(this.historyScrubber).slider(
                            "option",
                            "value",
                            this.history.length - 1
                        );
                        this.slideit();
                    } else {
                        saveCode = "False";
                    }
                    if (this.historyScrubber == null) {
                        saveCode = "False";
                    }
                    history_dfd.resolve();
                }.bind(this)
            )
            .fail(function () {
                console.log(
                    "Scrubber deferred failed - this should not happen"
                );
                history_dfd.resolve();
            });
        return {
            history_dfd: history_dfd,
            saveCode: saveCode,
        };
    }

    async checkCurrentAnswer() {
        return this.runProg();
    }

    logCurrentAnswer() {
        // leave this as a no-op until we figure out how to pull out logging
    }

    renderFeedback() {
        // leave as no-op as the unittests kind of have to handle their own feedback??
    }

    runProg(noUI, logResults) {
        if (typeof logResults === "undefined") {
            logResults = true;
        }
        if (typeof noUI !== "boolean") {
            noUI = false;
        }
        this.isAnswered = true;
        var prog = this.buildProg(true);
        var saveCode = "True";
        var scrubber_dfd, history_dfd, skulpt_run_dfd;
        $(this.output).text("");
        $(this.eContainer).remove();
        if (this.codelens) {
            this.codelens.style.display = "none";
        }
        if (this.clButton) {
            this.clButton.innerText = $.i18n("msg_activecode_show_in_codelens");
        }
        Sk.configure({
            output: this.outputfun.bind(this),
            read: this.fileReader,
            filewrite: this.filewriter.bind(this),
            __future__: Sk.python3,
            nonreadopen: true,
            //        python3: this.python3,
            imageProxy: "http://image.runestone.academy:8080/320x",
            inputfunTakesPrompt: true,
            jsonpSites: ["https://itunes.apple.com"],
        });
        Sk.divid = this.divid;
        Sk.logResults = logResults;
        if (this.graderactive && this.containerDiv.closest(".loading")) {
            Sk.gradeContainer = this.containerDiv.closest(".loading").id;
        } else {
            Sk.gradeContainer = this.divid;
        }
        this.setTimeLimit();
        (Sk.TurtleGraphics || (Sk.TurtleGraphics = {})).target = this.graphics;
        Sk.canvas = this.graphics.id; //todo: get rid of this here and in image
        let promise_list = [];
        if (!noUI) {
            $(this.runButton).attr("disabled", "disabled");
            $(this.historyScrubber).off("slidechange");
            $(this.historyScrubber).slider("disable");
            $(this.outDiv).show({
                duration: 700,
                queue: false,
            });
            var __ret = this.manage_scrubber(
                scrubber_dfd,
                history_dfd,
                saveCode
            );
            history_dfd = __ret.history_dfd;
            saveCode = __ret.saveCode;
            promise_list.push(history_dfd);
        }
        skulpt_run_dfd = Sk.misceval.asyncToPromise(function () {
            return Sk.importMainWithBody("<stdin>", false, prog, true);
        });
        promise_list.push(skulpt_run_dfd);
        // Make sure that the history scrubber is fully initialized AND the code has been run
        // before we start logging stuff.
        var self = this;
        Promise.all(promise_list).then(
            function (mod) {
                $(this.runButton).removeAttr("disabled");
                if (!noUI) {
                    if (this.slideit) {
                        $(this.historyScrubber).on(
                            "slidechange",
                            this.slideit.bind(this)
                        );
                    }
                    $(this.historyScrubber).slider("enable");
                }
                this.errLastRun = false;
                this.logRunEvent({
                    div_id: this.divid,
                    code: this.editor.getValue(),
                    lang: this.language,
                    errinfo: "success",
                    to_save: saveCode,
                    prefix: this.pretext,
                    suffix: this.suffix,
                    partner: this.partner,
                }); // Log the run event
            }.bind(this),
            function (err) {
                if (typeof history_dfd !== "undefined") {
                    history_dfd.done(function () {
                        $(self.runButton).removeAttr("disabled");
                        $(self.historyScrubber).on(
                            "slidechange",
                            self.slideit.bind(self)
                        );
                        $(self.historyScrubber).slider("enable");
                        self.logRunEvent({
                            div_id: self.divid,
                            code: self.editor.getValue(),
                            lang: self.langauge,
                            errinfo: err.toString(),
                            to_save: saveCode,
                            prefix: self.pretext,
                            suffix: self.suffix,
                            partner: self.partner,
                        }); // Log the run event
                        self.addErrorMessage(err);
                    });
                }
            }
        );
        if (typeof window.allVisualizers != "undefined") {
            $.each(window.allVisualizers, function (i, e) {
                e.redrawConnectors();
            });
        }

        return skulpt_run_dfd;
    }
}

var languageExtensions = {
    python: "py",
    html: "html",
    javascript: "js",
    java: "java",
    python2: "py",
    python3: "py",
    cpp: "cpp",
    c: "c",
    sql: "sql",
    octave: "m",
};

var errorText = {};

errorText.ParseError = $.i18n("msg_sctivecode_parse_error");
errorText.ParseErrorFix = $.i18n("msg_sctivecode_parse_error_fix");
errorText.TypeError = $.i18n("msg_activecode_type_error");
errorText.TypeErrorFix = $.i18n("msg_activecode_type_error_fix");
errorText.NameError = $.i18n("msg_activecode_name_error");
errorText.NameErrorFix = $.i18n("msg_activecode_name_error_fix");
errorText.ValueError = $.i18n("msg_activecode_value_error");
errorText.ValueErrorFix = $.i18n("msg_activecode_value_error_fix");
errorText.AttributeError = $.i18n("msg_activecode_attribute_error");
errorText.AttributeErrorFix = $.i18n("msg_activecode_attribute_error_fix");
errorText.TokenError = $.i18n("msg_activecode_token_error");
errorText.TokenErrorFix = $.i18n("msg_activecode_token_error_fix");
errorText.TimeLimitError = $.i18n("msg_activecode_time_limit_error");
errorText.TimeLimitErrorFix = $.i18n("msg_activecode_time_limit_error_fix");
errorText.Error = $.i18n("msg_activecode_general_error");
errorText.ErrorFix = $.i18n("msg_activecode_general_error_fix");
errorText.SyntaxError = $.i18n("msg_activecode_syntax_error");
errorText.SyntaxErrorFix = $.i18n("msg_activecode_syntax_error_fix");
errorText.IndexError = $.i18n("msg_activecode_index_error");
errorText.IndexErrorFix = $.i18n("msg_activecode_index_error_fix");
errorText.URIError = $.i18n("msg_activecode_uri_error");
errorText.URIErrorFix = $.i18n("msg_activecode_uri_error_fix");
errorText.ImportError = $.i18n("msg_activecode_import_error");
errorText.ImportErrorFix = $.i18n("msg_activecode_import_error_fix");
errorText.ReferenceError = $.i18n("msg_activecode_reference_error");
errorText.ReferenceErrorFix = $.i18n("msg_activecode_reference_error_fix");
errorText.ZeroDivisionError = $.i18n("msg_activecode_zero_division_error");
errorText.ZeroDivisionErrorFix = $.i18n(
    "msg_activecode_zero_division_error_fix"
);
errorText.RangeError = $.i18n("msg_activecode_range_error");
errorText.RangeErrorFix = $.i18n("msg_activecode_range_error_fix");
errorText.InternalError = $.i18n("msg_activecode_internal_error");
errorText.InternalErrorFix = $.i18n("msg_activecode_internal_error_fix");
errorText.IndentationError = $.i18n("msg_activecode_indentation_error");
errorText.IndentationErrorFix = $.i18n("msg_activecode_indentation_error_fix");
errorText.NotImplementedError = $.i18n("msg_activecode_not_implemented_error");
errorText.NotImplementedErrorFix = $.i18n(
    "msg_activecode_not_implemented_error_fix"
);
errorText.KeyError = $.i18n("msg_activecode_key_error");
errorText.KeyErrorFix = $.i18n("msg_activecode_key_error_fix");
errorText.AssertionError = $.i18n("msg_activecode_assertion_error");
errorText.AssertionErrorFix = $.i18n("msg_activecode_assertion_error_fix");

String.prototype.replaceAll = function (target, replacement) {
    return this.split(target).join(replacement);
};
