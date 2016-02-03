function TreeObject(data, parentObj, authInfo) {

  this.data = data;
  this.parent = parentObj;
  this.authInfo = authInfo;
  
  this.acls = {
    "access" : this.data.access === undefined? 4 : this.data.access,
    roles : this.data.roles? this.data.roles : {}
  };
  
  this.computedAcls = {};
  this.visibility = true;
  
  this.children = [];
  if (this.data.children) {
    for (var i = 0; i < data.children.length; i++) {
      var child = new TreeObject(data.children[i], this, authInfo);
      this.children.push(child);
    }
  }
};

TreeObject.prototype.constructor = TreeObject;

TreeObject.prototype.render = function(notFirst) {
  var template = _.template($( "#container_template" ).html());
  
  var icon;
  if (this.data.resourceType == "Collection") {
    icon = "archive";
  } else if (this.data.resourceType == "Folder") {
    icon = "folder";
  } else if (this.data.resourceType == "File") {
    icon = "file";
  } else if (this.data.resourceType == "Aggregate") {
    icon = "files-o";
  } else if (this.data.resourceType == "Unit") {
    icon = "university";
  }
  
  var newContent = $(template({ 
    tobj : this, 
    icon : icon
  }));
  
  if (this.element && !notFirst) {
    this.element.replaceWith(newContent);
  } else {
    this.parent.childrenContainer.append(newContent);
  }
  this.element = newContent;
  
  this.updateVisibility(true);
  
  this.element.data("treeObj", this);
  
  this.childrenContainer = this.element.find(".tree-children");
  
  for (var i = 0; i < this.children.length; i++) {
    this.children[i].render(true);
  }
};

TreeObject.prototype.isVisible = function() {
  // Units are always visible
  if (this.data.resourceType == "Unit") {
    return true;
  }
  
  // If the user or any of their groups are assigned roles, then the object is visible
  var userRole = this.computedAcls.roles[this.authInfo.user];
  if (userRole) {
    return true;
  }
  for (var i = 0; i < this.authInfo.groups.length; i++) {
    var groupRole = this.computedAcls.roles[this.authInfo.groups[i]];
    if (groupRole) {
      return true;
    }
  }
  
  // For the two public settings, as long as the item is not private than it is always visible
  if (this.computedAcls.access > 1) {
    return true;
  }
  
  // check if restricted to unc users and user is authenticated
  return this.computedAcls.access == 1 && this.authInfo.groups.indexOf("authenticated") != -1;
};

TreeObject.prototype.updateVisibility = function(shallow) {
  var badgeBox = $(".access-badge-box", this.element);
  badgeBox.empty();
  this.visibility = this.isVisible();
  if (this.visibility) {
    this.element.removeClass("not-visible");
  } else {
    this.element.addClass("not-visible");
  }
    
  var permissions = this.getPermissions();
  _.each(permissions, function(permissionType, name) {
    if (permissionType == "privacy") {
      badgeBox.append("<span class='label label-info'>" + name + "</span>");
    } else if (permissionType == "admin") {
      badgeBox.append("<span class='label label-warning'>" + name + "</span>");
    } else if (permissionType == "access") {
      badgeBox.append("<span class='label label-primary'>" + name + "</span>");
    }
  });
  
  if (!shallow) {
    for (var i = 0; i < this.children.length; i++) {
      this.children[i].updateVisibility();
    }
  }
};

TreeObject.prototype.getApplicableRoles = function() {
  var roles = [];
  
  var userRole = this.computedAcls.roles[this.authInfo.user];
  if (userRole) {
    roles.push(userRole);
  }
  for (var i = 0; i < this.authInfo.groups.length; i++) {
    var groupRole = this.computedAcls.roles[this.authInfo.groups[i]];
    if (groupRole) {
      roles.push(groupRole);
    }
  }
  
  return roles;
};

TreeObject.prototype.getPermissions = function() {
  var permissions = {};
  
  // Units are always visible
  if (this.data.resourceType == "Unit") {
    var userRole = this.computedAcls.roles[this.authInfo.user];
    if (userRole == "owner") {
      permissions["Create Collection"] = "admin";
      permissions["Assign Rights"] = "admin";
    }
    return permissions;
  }
  
  if (this.acls.access == 0) {
    permissions["Staff Only"] = "privacy";
  } else if (this.computedAcls.access == 1) {
    permissions["UNC Only"] = "privacy";
  }
  
  if (this.computedAcls.embargo) {
      permissions["Embargoed"] = "privacy";
    }
  
  // Get roles on this object for the current user
  var roles = this.getApplicableRoles();
  // Download only applies to files and aggregates
  if (this.data.resourceType == "Aggregate" || this.data.resourceType == "File") {
    // If user has download  role or above, add download option
    if (roles.length > 0 && roles.indexOf("discover") == -1) {
      permissions["Download"] = "access";
    } else if (!this.computedAcls.embargo && !this.computedAcls.metadataOnly) {
      // If its not embargoed, then determine download based on access setting
      if (this.computedAcls.access == 4 
          || (this.computedAcls.access == 1
            && this.authInfo.groups.indexOf("authenticated") != -1)) {
        permissions["Download"] = "access";
      }
    }
  }
  
  if (roles.indexOf("describe") != -1) {
    permissions["Describe"] = "admin";
  }
  if (roles.indexOf("ingest") != -1) {
    permissions["Describe"] = "admin";
    permissions["Ingest"] = "admin";
  }
  if (roles.indexOf("manage") != -1) {
    permissions["Describe"] = "admin";
    permissions["Ingest"] = "admin";
    permissions["Move"] = "admin";
    permissions["Delete"] = "admin";
    permissions["Change Access"] = "admin";
  }
  if (roles.indexOf("owner") != -1) {
    permissions["Describe"] = "admin";
    permissions["Ingest"] = "admin";
    permissions["Move"] = "admin";
    permissions["Delete"] = "admin";
    permissions["Change Access"] = "admin";
    permissions["Destroy"] = "admin";
    if (this.data.resourceType == "Collection") {
      permissions["Assign Rights"] = "admin";
    }
  }
  
  return permissions;
};

TreeObject.prototype.setAccess = function(access) {
  this.acls.access = access;
  
  this.updateAcls();
  
  this.updateVisibility();
};

TreeObject.prototype.updateAcls = function(inherited) {
  if (!inherited) {
    inherited = $.extend({}, this.parent.computedAcls);
  }
  
  this.computedAcls = $.extend(true, {}, this.acls, inherited);
  
  // Use the most restrictive access level between this object and its parent
  if (this.acls.access < inherited.access) {
    this.computedAcls.access = this.acls.access;
  }
  
  for (var i = 0; i < this.children.length; i++) {
    this.children[i].updateAcls(this.computedAcls);
  }
};

/*                                        */

function ContainerSettingsForm(treeObj) {
  this.treeObj = treeObj;
};

ContainerSettingsForm.prototype.constructor = ContainerSettingsForm;

ContainerSettingsForm.prototype.render = function(parentElement) {
  var self = this;
  var template;
  if (this.treeObj.data.resourceType == "Unit" || this.treeObj.data.resourceType == "Collection") {
    template = _.template($("#container_settings").html());
  } else {
    template = _.template($("#object_settings").html());
  }
  
  this.element = $(template({
    tobj : this.treeObj
  }));
  parentElement.html(this.element);
  
  this.populateRoles();
  
  $("input[name='accessRadio']:radio", this.element).change(function() {
    var value = $(this).val();
    self.treeObj.acls.access = value;
    
    self.treeObj.updateAcls();
    self.treeObj.updateVisibility();
  });
  
  this.element.on("click", ".remove-role", function(e) {
    var entry = $(this).closest(".role-entry");
    var agent = entry.data("agent");
    
    delete self.treeObj.acls.roles[agent];
    entry.remove();
    
    self.treeObj.updateAcls();
    self.treeObj.updateVisibility();
  });
  
  this.element.on("change", "select[name='existingRoleValue']", function(e) {
    var entry = $(this).closest(".role-entry");
    var agent = entry.data("agent");
    
    self.treeObj.acls.roles[agent] = $(this).val();
    
    self.treeObj.updateAcls();
    self.treeObj.updateVisibility();
  });
  
  $(".metadata-only input", this.element).change(function(e) {
    var isChecked = $(this).prop("checked");
    self.treeObj.acls.metadataOnly = isChecked;
    self.treeObj.updateAcls();
    self.treeObj.updateVisibility();
  });
  
  $("select[name='embargo-duration']", this.element).change(function(e) {
    var value = $(this).val();
    
    if (value) {
      value = value.split(" ");
      var endDate = moment().add(value[0], value[1]).format("MM/DD/YYYY");
      $("input[name='embargo-end']", this.element).val(endDate);
      self.treeObj.acls.embargo = endDate;
    } else {
      $("input[name='embargo-end']", this.element).val("");
      delete self.treeObj.acls.embargo;
    }
    
    self.treeObj.updateAcls();
    self.treeObj.updateVisibility();
  });
  
  $("input[name='embargo-end']", this.element).change(function(e) {
    var value = $(this).val();
    
    if (value) {
      self.treeObj.acls.embargo = value;
      $("select[name='embargo-duration']", this.element).val("until");
    } else {
      delete self.treeObj.acls.embargo;
      $("select[name='embargo-duration']", this.element).val("");
    }
     
    self.treeObj.updateAcls();
    self.treeObj.updateVisibility();
  });
  
  // Add a new role assignment to the select object
  $(".add-role-form", this.element).submit(function(e){
    var role = $("select[name='roleValue']", self.element).val();
    var agent = $("input[name='agentName']", self.element).val();
    
    if (!self.treeObj.acls.roles) {
      self.treeObj.acls.roles = {};
    }
    
    if (agent in self.treeObj.computedAcls.roles) {
      alert(agent + " is already assigned");
      return;
    }
    console.log("Adding to role", agent, role);
    self.treeObj.acls.roles[agent] = role;
    
    self.populateRoles();
    
    self.treeObj.updateAcls();
    self.treeObj.updateVisibility();
    
    e.preventDefault();
  });
};

ContainerSettingsForm.prototype.populateRoles = function() {
  var self = this;
  var template = _.template($("#staff-roles-template").html());
  
  var inheritedRoles = {};
  _.each(this.treeObj.computedAcls.roles, function(role, agent) {
    if (!self.treeObj.acls.roles || !(agent in self.treeObj.acls.roles)) {
      inheritedRoles[agent] = role;
    }
  });
  
  var rolesContainer = $(".staff-roles-list", this.element);
  var rolesList = template({
    tobj : this.treeObj,
    inheritedRoles : inheritedRoles
  });
  
  rolesContainer.html(rolesList);
};

/*                                        */

function AgentSelectionForm(userTemplates) {
  this.authInfo = {};
  this.userTemplates = userTemplates;
  this.userSelect = $("#agent_template");
  
  for (var i = 0; i < userTemplates.length; i++) {
    this.userSelect.append("<option value='" + i + "'>" + userTemplates[i].label + "</option>");
  }
  
  this.setFromSelectedTemplate(0);
  this.refreshAuthInfo();
};

AgentSelectionForm.prototype.constructor = AgentSelectionForm;

AgentSelectionForm.prototype.setFromSelectedTemplate = function(index) {
  $("#auth_user").val(this.userTemplates[index].user);
  $("#auth_groups").val(this.userTemplates[index].groups);
  this.refreshAuthInfo();
};

AgentSelectionForm.prototype.refreshAuthInfo = function() {
  this.authInfo.user = $("#auth_user").val();
  this.authInfo.groups = $("#auth_groups").val().split(" ");
};

AgentSelectionForm.prototype.initEvents = function(treeRootObj) {
  var self = this;
  
  
  // Bind changing of the current users credentials
  $(".set-auth-form").submit(function(e){
    e.preventDefault()
    
    self.refreshAuthInfo();
    
    treeRootObj.updateAcls();
    treeRootObj.updateVisibility();
  });
  
  this.userSelect.change(function(e){
    self.setFromSelectedTemplate($(this).val());
    
    treeRootObj.updateAcls();
    treeRootObj.updateVisibility();
  });
  
  $("#view_agent_details").click(function(e) {
    if ($("#agent_details:visible").length > 0) {
      $(this).text("view details");
      $("#agent_details").hide();
    } else {
      $(this).text("hide details")
      $("#agent_details").show();
    }
    resizeTree();
  });
};

function resizeTree() {
  $("#tree_view").height($(window).height() - $(".set-auth-form").parent().height());
}

$(document).ready(function(){
  // Retrieve dataset name from GET to determine which tree to load
  var params = _.object(_.compact(_.map(location.search.slice(1).split('&'), function(item) {  if (item) return item.split('='); })));
  var dataset;
  if ("dataset" in params) {
    dataset = params.dataset;
    dataset = dataset.split("/").slice(-1)[0];
    $("#dataset").val(dataset);
  } else {
    dataset = "dept-history.json";
  }
  
  // Load the tree dataset and initialize the demo
  $.ajax({
    url : dataset,
    dataType : "json",
  }).done(function(data){
    var agentSelect = new AgentSelectionForm(userTemplates, treeRootObj);
    
    // Initialize the tree
    var treeRoot = $("#tree_root");
    var treeRootObj = new TreeObject(data[0], {
      childrenContainer : treeRoot.children(".tree-children")
    }, agentSelect.authInfo);
    treeRootObj.updateAcls();
    // Render the tree
    treeRootObj.render();
    
    // Adjust height of tree view to fit screen
    resizeTree();
    $(window).resize(resizeTree);
    
    var settingsContainer = $("#settings_container");
    // Bind selection event for collection objects which populates settings form
    treeRoot.on("click", ".tree-object-data", function(e) {
      var selectedObj = $(this).closest(".tree-object").data("treeObj");
      $(".selected-tree-obj").removeClass("selected-tree-obj");
      $(this).addClass("selected-tree-obj");
      
      var formObj = new ContainerSettingsForm(selectedObj);
      formObj.render(settingsContainer);
    });
    $(".tree-object-data").first().click();
    
    $("#dataset").change(function(e) {
      window.location.assign("?dataset=" + $(this).val());
    });
    
    // Initialize bindings for changing user agent info
    agentSelect.initEvents(treeRootObj);
  })
});


