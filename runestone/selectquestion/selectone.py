# *********************************
# |docname| - An indirect directive
# *********************************
#
# This directive lets you specify a question by random selection
# Given a list of question ids, it will randomly select one of those ids
# to present to the student.
# given a competency it will select a random question from all questions that
# test for that competency.

# Copyright (C) 2020  Runestone Interactive LLC
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

# Imports from standard libarary
# ------------------------------

# Imports from third party libraries
# ----------------------------------
from docutils import nodes
from docutils.parsers.rst import directives
from sqlalchemy import Table

# local imports
# -------------
from runestone.server.componentdb import (
    addAssignmentQuestionToDB,
    addQuestionToDB,
    addHTMLToDB,
    get_engine_meta,
    maybeAddToAssignment,
)
from runestone.common.runestonedirective import (
    RunestoneIdDirective,
    RunestoneNode,
    add_i18n_js,
)


TEMPLATE = """
<div class="runestone alert alert-warning">
<div data-component="selectquestion" id={component_id} {selector} {points}>
    <p>Loading ...</p>
</div>
</div>
"""


def setup(app):
    app.add_directive("selectquestion", SelectQuestion)


class SelectQuestion(RunestoneIdDirective):
    """
    .. selectquestion:: uniqueid
       :fromid: [id [, id]+ ]
       :proficiency: randomly choose a question that tests a particular proficiency
       :basecourse: restrict question choices to the current base course
       :alwaysrandom: choose a new random question every time if possible
       :points: number of points for this question
    """

    required_arguments = 1
    optional_arguments = 0
    has_content = False
    option_spec = RunestoneIdDirective.option_spec.copy()
    option_spec.update(
        {
            "fromid": directives.unchanged,
            "proficiency": directives.unchanged,
            "basecourse": directives.flag,
        }
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def run(self):

        super(SelectQuestion, self).run()
        addQuestionToDB(self)
        env = self.state.document.settings.env
        is_dynamic = env.config.html_context.get("dynamic_pages", False)
        if is_dynamic:
            self.options["message"] = "Loading ..."
        else:
            self.options[
                "message"
            ] = "The selectquestion directive only works with dynamic pages"

        if "fromid" in self.options:
            self.question_bank_choices = self.options["fromid"]
            self.options[
                "selector"
            ] = f"data-questionlist='{self.question_bank_choices}'"

            # todo: validate that question(s) are in the database

        self.options["component_id"] = self.arguments[0].strip()

        if "proficiency" in self.options:
            pass

        if "points" in self.options:
            self.options["points"] = f"data-points={self.options['points']}"
        else:
            self.options["points"] = ""

        maybeAddToAssignment(self)

        res = TEMPLATE.format(**self.options)

        return [nodes.raw(self.block_text, res, format="html")]
