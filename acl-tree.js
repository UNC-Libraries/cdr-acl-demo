function TreeObject(data, parentObj, authInfo) {

  this.data = data;
  this.parent = parentObj;
  this.authInfo = authInfo;
  
  this.acls = {
    everyone : this.data.everyone,
    roles : this.data.roles? this.data.roles : {},
    "private" : this.data.private,
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
    icon = "fa-files-o";
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
  if (this.computedAcls.everyone == "public_disco"
      || this.computedAcls.everyone == "public_full") {
    return !this.computedAcls.private;
  }
  
  // If restricted to authenticated, and user is authenticated, then depends on if private
  if (this.computedAcls.everyone == "authenticated"
      && this.authInfo.groups.indexOf("authenticated") != -1) {
    return !this.computedAcls.private;
  }
  
  return false;
};

TreeObject.prototype.updateVisibility = function(shallow) {
  var badgeBox = $(".access-badge-box", this.element);
  badgeBox.empty();
  this.visibility = this.isVisible();
  if (this.visibility) {
    this.element.removeClass("not-visible");
    
    var permissions = this.getPermissions();
    _.each(permissions, function(permissionType, name) {
      if (permissionType == "access") {
        badgeBox.append("<span class='label label-primary'>" + name + "</span>")
      } else {
        badgeBox.append("<span class='label label-warning'>" + name + "</span>")
      }
    });
  } else {
    this.element.addClass("not-visible");
  }
  
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
      roles.push(userRole);
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
  
  // Get roles on this object for the current user
  var roles = this.getApplicableRoles();
  // Download only applies to files and aggregates
  if (this.data.resourceType == "Aggregate" || this.data.resourceType == "File") {
    // If user has download or above, add download option
    if ((roles.length > 0 && roles.indexOf("discover") == -1) ||
        // Or if the object is not private and has full access, download time
        (!this.computedAcls.private && (
          this.computedAcls.everyone == "public_full"
          || (this.computedAcls.everyone == "authenticated"
          && this.authInfo.groups.indexOf("authenticated") != -1)))) {
        permissions["Download"] = "access";
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

TreeObject.prototype.setPrivate = function(isPrivate) {
  this.acls.private = isPrivate;
  
  this.changeAccess();
  
  this.updateVisibility();
};

TreeObject.prototype.changeAccess = function(inherited) {
  if (!inherited) {
    inherited = $.extend({}, this.parent.computedAcls);
  }
  
  this.computedAcls = $.extend(true, {}, this.acls, inherited);
  
  if (inherited.private || this.acls.private) {
    this.computedAcls.private = true;
  }
  
  console.log(this.data.title, this.computedAcls);
  
  for (var i = 0; i < this.children.length; i++) {
    this.children[i].changeAccess(this.computedAcls);
  }
};

/*                                        */

function ContainerSettingsForm(treeObj) {
  this.treeObj = treeObj;
};

ContainerSettingsForm.prototype.constructor = ContainerSettingsForm;

ContainerSettingsForm.prototype.render = function(parentElement) {
  var self = this;
  var template = _.template($("#container_settings").html());
  
  this.element = $(template({
    tobj : this.treeObj,
    canEdit : this.treeObj.data.resourceType == "Collection" || this.treeObj.data.resourceType == "Unit"
  }));
  parentElement.html(this.element);
  
  this.populateRoles();
  
  $("input[name='everyoneRadio']:radio", this.element).change(function() {
    var value = $(this).val();
    if (value == "private") {
      self.treeObj.acls.everyone = null;
    } else {
      self.treeObj.acls.everyone = $(this).val();
    }
    
    self.treeObj.setPrivate(value == "private");
    console.log("Changed everyone setting", self.treeObj.data.everyone);
    
    self.treeObj.changeAccess();
    self.treeObj.updateVisibility();
  });
  
  this.element.on("click", ".remove-role", function(e) {
    var entry = $(this).closest(".role-entry");
    var entity = entry.data("name");
    
    delete self.treeObj.acls.roles[entity];
    entry.remove();
    
    self.treeObj.changeAccess();
    self.treeObj.updateVisibility();
  });
  
  // Add a new role assignment to the select object
  $(".add-role-form", this.element).submit(function(e){
    var role = $("select[name='roleValue']", self.element).val();
    var entity = $("input[name='entityName']", self.element).val();
    
    if (!self.treeObj.acls.roles) {
      self.treeObj.acls.roles = {};
    }
    
    if (entity in self.treeObj.computedAcls.roles) {
      alert(entity + " is already assigned");
      return;
    }
    console.log("Adding to role", entity, role);
    self.treeObj.acls.roles[entity] = role;
    
    self.populateRoles();
    
    self.treeObj.changeAccess();
    self.treeObj.updateVisibility();
    
    e.preventDefault();
  });
};

ContainerSettingsForm.prototype.populateRoles = function() {
  var self = this;
  var template = _.template($("#staff-roles-template").html());
  
  var inheritedRoles = {};
  _.each(this.treeObj.computedAcls.roles, function(role, entity) {
    if (!self.treeObj.acls.roles || !(entity in self.treeObj.acls.roles)) {
      inheritedRoles[entity] = role;
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

$(document).ready(function(){
  $.ajax({
    url : "faculty-works.json",
    dataType : "json",
  }).done(function(data){
    var authInfo = {};
    function updateUserInfo() {
      authInfo.user = $("#auth_user").val();
      authInfo.groups = $("#auth_groups").val().split(" ");
    }
    updateUserInfo();
    
    // Initialize the tree
    var treeRoot = $("#tree_root");
    var treeRootObj = new TreeObject(data[0], {
      childrenContainer : treeRoot.children(".tree-children")
    }, authInfo);
    treeRootObj.changeAccess();
    // Render the tree
    treeRootObj.render();
    
    // Adjust height of tree view to fit screen
    $("#tree_view").height($(window).height() - $(".set-auth-form").height());
    $(window).resize(function() {
      $("#tree_view").height($(window).height() - $(".set-auth-form").height());
    });
    
    // Bind change event for toggle if an object is private
    treeRoot.on("click", "input[name='checkPrivate']", function(e) {
      var selectedObj = $(this).closest(".tree-object").data("treeObj");
      var isPrivate = $(this).prop("checked");
      selectedObj.setPrivate(isPrivate);
    });
    
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
    
    // Bind changing of the current users credentials
    $(".set-auth-form").submit(function(e){
      e.preventDefault()
      
      updateUserInfo();
      
      treeRootObj.changeAccess();
      treeRootObj.updateVisibility();
    });
  })
});


