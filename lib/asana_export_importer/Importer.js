var aei = require("./");

var Importer = module.exports = aei.ideal.Proto.extend().setType("Importer").newSlots({
    organizationId: null,
    export: null,
    concurrency: 300
}).setSlots({
    run: function() {
        this.export().prepareForImport();
        this._runImport();
        this.export().cleanupAfterImport();
    },

    _runImport: function() {
        this._importTeams();
        this._importProjects();
        this._importTags();

        this._importTasks();
        this._importStories();
        this._importAttachments();

        this._addSubtasksToTasks();
        this._addTasksToProjects();
        this._addTasksToTags();

        this._importUsers();

        this._addAssigneesToTasks();
        this._addTaskAssigneeStatuses();

        this._addFollowersToTasks();
        this._addMembersToTeams();
        this._addMembersToProjects();
        this._addFollowersToProjects();
    },

    _importTeams: function() {
        this._forEachOfType("team", function(team) {
            team.setOrganizationId(this.organizationId());
            team.create();
        }, "importing teams");
    },

    _importProjects: function() {
        this._forEachOfType("project", function(project) {
            project.setWorkspaceId(this.organizationId());
            project.setAsanaTeamId(this.app().sourceToAsanaMap().at(project.sourceTeamId()));
            if (project.asanaTeamId()) {
                project.create();
            }
        }, "importing projects");
    },

    _importTags: function() {
        var existingTags = aei.Future.withPromise(this.app().apiClient().workspaces.tags(this.organizationId())).wait();
        this._forEachOfType("tag", function(tag) {
            tag.setWorkspaceId(this.organizationId());

            var existingTag = existingTags.detectProperty("name", tag.name());
            if (existingTag) {
                tag.setAsanaId(existingTag.id);
            } else {
                tag.setAsanaTeamId(this.app().sourceToAsanaMap().at(tag.sourceTeamId()));
                tag.create();
            }
        }, "importing tags");
    },

    _importTasks: function() {
        this._forEachOfType("task", function(task) {
            task.performSets({
                workspaceId: this.organizationId()
            });
            task.create();
        }, "importing tasks");
    },

    _importStories: function() {
        this._forEachOfType("task", function(task) {
            task.stories().forEach(function(story) {
                task.addStory(story);
            });
        }, "importing stories for tasks");
    },

    _importAttachments: function() {
        this._forEachOfType("attachment", function(attachment) {
            attachment.performSets({
                taskId: this.app().sourceToAsanaMap().at(attachment.sourceParentId())
            }).create();
        }, "importing attachments");
    },

    _importUsers: function() {
        this._forEachOfType("user", function(user) {
            if (user.email()) {
                user.setWorkspaceId(this.organizationId());
                user.create();
            }
        }, "importing users");
    },

    _addSubtasksToTasks: function() {
        this._forEachOfType("task", this._addItemsToObject, "adding subtasks to tasks");
    },

    _addTasksToProjects: function() {
        this._forEachOfType("project", this._addItemsToObject, "adding tasks to projects");
    },

    _addTasksToTags: function() {
        this._forEachOfType("tag", this._addItemsToObject, "adding tasks to tags");
    },

    _addAssigneesToTasks: function() {
        this._forEachOfType("user", this._addItemsToObject, "assigning tasks to users");
    },

    _addTaskAssigneeStatuses: function() {
        // This must be done as a subsequent step because setting assignee clears it
        this._forEachOfType("task", function(task) {
            task.addAssigneeStatus();
        }, "adding assignee status to tasks");
    },

    _addFollowersToTasks: function() {
        this._forEachOfType("task", function(task) {
            var followerAsanaIds = task.sourceFollowerIds().map(this._userAsanaIdWithSourceId.bind(this)).emptiesRemoved();
            if (followerAsanaIds.length > 0) {
                task.addFollowers(followerAsanaIds);
            }
        }, "adding followers to tasks");
    },

    _addFollowersToProjects: function() {
        this._forEachOfType("project", function(project) {
            var followerAsanaIds = project.sourceFollowerIds().map(this._userAsanaIdWithSourceId.bind(this)).emptiesRemoved();
            if (followerAsanaIds.length > 0) {
                project.addFollowers(followerAsanaIds);
            }
        }, "adding followers to projects");
    },

    _addMembersToTeams: function() {
        this._forEachOfType("team", function(team) {
            team.sourceMemberIds().map(this._userAsanaIdWithSourceId.bind(this)).emptiesRemoved().forEach(function(memberAsanaId) {
                team.addMember(memberAsanaId);
            });
        }, "adding members to teams");
    },

    _addMembersToProjects: function() {
        this._forEachOfType("project", function(project) {
            var memberAsanaIds = project.sourceMemberIds().map(this._userAsanaIdWithSourceId.bind(this)).emptiesRemoved();
            if (memberAsanaIds.length > 0) {
                project.addMembers(memberAsanaIds);
            }
        }, "adding members to projects");
    },

    // helper methods:

    _forEachOfType: function(name, func, description) {
        console.log("started " + description);

        var self = this;
        var count = 0;
        function process() {
            var current = ++count;
            console.log("  > started " + name + " #" + current);
            var result = func.apply(self, arguments);
            console.log("  < completed " + name + " #" + current);
            return result;
        }

        if (this.export()[name + "Iterable"]) {
            var iterable =  this.export()[name + "Iterable"]();
        } else {
            var iterable = this.export()[name + "s"]();
        }
        iterable.forEachParallel(process, null, self.concurrency());

        console.log("completed " + description + "\n");
    },
    
    _addItemsToObject: function(object) {
        var self = this;
        object.sourceItemIds().reverse().forEach(function(sourceItemId, index) {
            var asanaItemId = self.app().sourceToAsanaMap().at(sourceItemId);
            console.log("    + adding item #" + index + ": task [source=" + sourceItemId + ", asana=" + asanaItemId + "] to " + object.resourceName() + " [source=" + object.sourceId() + ", asana=" + object.asanaId() + "]");
            if (asanaItemId) {
                object.addItem(asanaItemId);
                console.log("    - added item #" + index);
            } else {
                console.log("    x missing item #" + index);
            }
        });
    },

    _userAsanaIdWithSourceId: function(sourceId) {
        return this.app().sourceToAsanaMap().at(sourceId);
    }
});
