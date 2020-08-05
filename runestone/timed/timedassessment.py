# *******************************
# |docname| - Timed Assessments
# *******************************
# Group together several exercises into an assessment
# Really we should treat this as a kind of assignment.
# But it has to be done indirectly, especially in the case of a selectquestion
# see `runestone/selectquestion/toctree`
# 1. When processing a timed assessment add an assignment to the database for the basecourse
# 2. Before processing the body of the assessment we can set a flag in the environment
#    so that the children will know they are part of an assignment.
# 3. During recursive processing questions should add themselves to the assignment.
#    ``selectquestions`` shoud add themselves as selectquestions so the assignment
#    ends up with the correct fixed number of questions.  The resolution of these
#    will need to be handled by the grader...  The simplest thing may be to send the
#    log the results under the id of the select question rather than the selected question
#    as this will allow for the analysis by competency area.
#

# License
# -------
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
__author__ = "isaiahmayerchak"

# Imports
# -------
from docutils import nodes
from docutils.parsers.rst import directives
from runestone.common.runestonedirective import RunestoneIdDirective, RunestoneNode
from runestone.server.componentdb import addAssignmentToDB

# Timed Assessment Implementation
# -------------------------------
# Everydirective uses setup to add itself to the applications and add any nodes
def setup(app):
    app.add_directive("timed", TimedDirective)
    app.add_node(TimedNode, html=(visit_timed_node, depart_timed_node))


class TimedNode(nodes.General, nodes.Element, RunestoneNode):
    def __init__(self, content, **kwargs):
        super(TimedNode, self).__init__(**kwargs)
        self.timed_options = content


def visit_timed_node(self, node):
    # Set options and format templates accordingly

    if "timelimit" not in node.timed_options:
        node.timed_options["timelimit"] = ""
    else:
        node.timed_options["timelimit"] = "data-time=" + str(
            node.timed_options["timelimit"]
        )

    if "noresult" in node.timed_options:
        node.timed_options["noresult"] = "data-no-result"
    else:
        node.timed_options["noresult"] = ""

    if "timedfeedback" in node.timed_options:
        node.timed_options["timedfeedback"] = "data-timedfeedback=true"
    else:
        node.timed_options["timedfeedback"] = ""

    if "notimer" in node.timed_options:
        node.timed_options["notimer"] = "data-no-timer"
    else:
        node.timed_options["notimer"] = ""

    if "fullwidth" in node.timed_options:
        node.timed_options["fullwidth"] = "data-fullwidth"
    else:
        node.timed_options["fullwidth"] = ""

    res = TEMPLATE_START % node.timed_options
    self.body.append(res)


def depart_timed_node(self, node):
    # Set options and format templates accordingly
    res = TEMPLATE_END % node.timed_options

    self.body.append(res)


# Templates to be formatted by node options
TEMPLATE_START = """
    <ul data-component="timedAssessment" %(timelimit)s id="%(divid)s" %(noresult)s %(timedfeedback)s %(notimer)s %(fullwidth)s>
    """

TEMPLATE_END = """</ul>
    """


class TimedDirective(RunestoneIdDirective):
    """
.. timed:: identifier
    :timelimit: Number of minutes student has to take the timed assessment--if not provided, no time limit
    :noresult: Boolean, doesn't display score
    :timedfeedback: Boolean, Show feedback even in timed mode
    :notimer: Boolean, doesn't show timer
    :fullwidth: Boolean, allows the items in the timed assessment to take the full width of the screen...

    """

    required_arguments = 1
    optional_arguments = 0
    final_argument_whitespace = True
    has_content = True
    option_spec = {
        "timelimit": directives.positive_int,
        "noresult": directives.flag,
        "timedfeedback": directives.flag,
        "fullwidth": directives.flag,
        "notimer": directives.flag,
    }

    def run(self):
        """
            process the timed directive and generate html for output.
            :param self:
            :return:
            .. timed:: identifier
                :timelimit: Number of minutes student has to take the timed assessment--if not provided, no time limit
                :noresult: Boolean, doesn't display score
                :timedfeedback: Boolean, show feedback
                :notimer: Boolean, doesn't show timer
                :fullwidth: Boolean, allows the items in the timed assessment to take the full width of the screen
            ...
            """
        super(TimedDirective, self).run()
        self.assert_has_content()  # make sure timed has something in it

        if "timelimit" in self.options:
            timelimit = self.options["timelimit"]
        else:
            timelimit = None

        timed_node = TimedNode(self.options, rawsource=self.block_text)
        timed_node.source, timed_node.line = self.state_machine.get_source_and_line(
            self.lineno
        )
        # Use the environment so that any parsed directives will know they
        # are inside a timed exam.
        env = self.state.document.settings.env
        name = self.arguments[0].strip()
        if not getattr(env, "in_timed", False):
            setattr(env, "in_timed", name)
        addAssignmentToDB(name, self.basecourse, is_timed="T", time_limit=timelimit)

        self.state.nested_parse(self.content, self.content_offset, timed_node)
        delattr(env, "in_timed")

        return [timed_node]
