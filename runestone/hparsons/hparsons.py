# *********
# |docname|
# *********
# Copyright (C) 2011  Bradley N. Miller
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
__author__ = "bmiller"

from docutils import nodes
from docutils.parsers.rst import directives
from sqlalchemy import Table
from runestone.server.componentdb import (
    addQuestionToDB,
    addHTMLToDB,
    get_engine_meta,
    maybeAddToAssignment,
)
from runestone.common.runestonedirective import (
    RunestoneIdDirective,
    RunestoneIdNode,
)

def setup(app):
    app.add_directive("hparsons", HParsonsDirective)
    app.add_node(HParsonsNode, html=(visit_hp_node, depart_hp_node))


TEMPLATE_START = """
<div>
<div data-component="hparsons" id=%(divid)s data-question_label="%(question_label)s" class="alert alert-warning hparsons_section">
<div class="hp_question col-md-12">
"""

TEMPLATE_END = """
</div>
<div class='hparsons'></div>
<textarea data-lang="%(language)s" 
    %(optional)s
    %(dburl)s
    %(textentry)s
    %(reuse)s
    style="visibility: hidden;">
%(initialsetting)s
</textarea>
</div>
</div>
"""


class HParsonsNode(nodes.General, nodes.Element, RunestoneIdNode):
    def __init__(self, options, **kwargs):
        super(HParsonsNode, self).__init__(**kwargs)
        self.runestone_options = options


# self for these functions is an instance of the writer class.  For example
# in html, self is sphinx.writers.html.SmartyPantsHTMLTranslator
# The node that is passed as a parameter is an instance of our node class.
def visit_hp_node(self, node):

    node.delimiter = "_start__{}_".format(node.runestone_options["divid"])

    self.body.append(node.delimiter)

    res = TEMPLATE_START % node.runestone_options
    self.body.append(res)


def depart_hp_node(self, node):
    res = TEMPLATE_END % node.runestone_options
    self.body.append(res)

    addHTMLToDB(
        node.runestone_options["divid"],
        node.runestone_options["basecourse"],
        "".join(self.body[self.body.index(node.delimiter) + 1 :]),
    )

    self.body.remove(node.delimiter)


class HParsonsDirective(RunestoneIdDirective):
    # only keep: language, autograde, dburl
    """
    .. hparsons:: uniqueid
       :language: sql, regex
       :dburl: only for sql -- url to load database
       TODO: fix textentry
       :reuse: only for parsons -- make the blocks reusable
       :textentry: if you will use text entry instead of horizontal parsons

        Here is the problem description. It must ends with the tildes.
        Make sure you use the correct delimitier for each section below.
        ~~~~
        --blocks--
        block 1
        block 2
        --explanations--
        explanations for block 1
        explanations for block 2
        --unittest--
        assert 1,1 == world
        assert 0,1 == hello
        assert 2,1 == 42
    """

    required_arguments = 1
    optional_arguments = 1
    has_content = True
    option_spec = RunestoneIdDirective.option_spec.copy()
    option_spec.update(
        {
            "dburl": directives.unchanged,
            "language": directives.unchanged,
            "textentry": directives.flag,
            "reuse": directives.flag,
        }
    )

    def run(self):
        super(HParsonsDirective, self).run()

        env = self.state.document.settings.env

        if "textentry" in self.options:
            self.options['textentry'] = ' data-textentry="true"'
        else:
            self.options['textentry'] = ''

        if "reuse" in self.options:
            self.options['reuse'] = ' data-reuse="true"'
        else:
            self.options['reuse'] = ''

        explain_text = None
        if self.content:
            if "~~~~" in self.content:
                idx = self.content.index("~~~~")
                explain_text = self.content[:idx]
                self.content = self.content[idx + 1 :]
            source = "\n".join(self.content)
        else:
            source = "\n"

        self.explain_text = explain_text or ["Not an Exercise"]
        addQuestionToDB(self)

        self.options["initialsetting"] = source

        # TODO: change this
        if "language" not in self.options:
            self.options["language"] = "python"

        # SQL Options
        if "dburl" in self.options:
            self.options["dburl"] = "data-dburl='{}'".format(self.options["dburl"])
        else:
            self.options["dburl"] = ""

        course_name = env.config.html_context["course_id"]
        divid = self.options["divid"]

        engine, meta, sess = get_engine_meta()

        if engine:
            Source_code = Table(
                "source_code", meta, autoload=True, autoload_with=engine
            )
            engine.execute(
                Source_code.delete()
                .where(Source_code.c.acid == divid)
                .where(Source_code.c.course_id == course_name)
            )
            engine.execute(
                Source_code.insert().values(
                    acid=divid,
                    course_id=course_name,
                    main_code=source,
                    suffix_code=suffix,
                )
            )
        else:
            if (
                not hasattr(env, "dberr_activecode_reported")
                or not env.dberr_activecode_reported
            ):
                env.dberr_activecode_reported = True
                print(
                    "Unable to save to source_code table in activecode.py. Possible problems:"
                )
                print("  1. dburl or course_id are not set in conf.py for your book")
                print("  2. unable to connect to the database using dburl")
                print("")
                print(
                    "This should only affect the grading interface. Everything else should be fine."
                )

        acnode = HParsonsNode(self.options, rawsource=self.block_text)
        acnode.source, acnode.line = self.state_machine.get_source_and_line(self.lineno)
        self.add_name(acnode)  # make this divid available as a target for :ref:

        maybeAddToAssignment(self)
        if explain_text:
            self.updateContent()
            self.state.nested_parse(explain_text, self.content_offset, acnode)

        return [acnode]
