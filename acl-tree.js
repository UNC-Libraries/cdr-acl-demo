function TreeObject(data, parentObj, authInfo) {

  this.data = data;
  this.parent = parentObj;
  this.authInfo = authInfo;
  
  this.acls = {
    everyone : this.data.everyone,
    roles : this.data.roles,
    "private" : this.data.private,
  };
  
  
  this.computedAcls = {};
  if (!("roles" in this.data)) {
    this.data.roles = {};
  }
  
  this.children = [];
  if (this.data.children) {
    for (var i = 0; i < data.children.length; i++) {
      var child = new TreeObject(data.children[i], this, authInfo);
      this.children.push(child);
    }
  }
};

TreeObject.prototype.constructor = TreeObject;

TreeObject.prototype.render = function() {
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
  
  this.element = $(template({ 
    tobj : this, 
    icon : icon,
    isPrivate : false
  }));
  this.parent.childrenContainer.append(this.element);
  
  this.element.data("treeObj", this);
  
  this.childrenContainer = this.element.find(".tree-children");
  
  for (var i = 0; i < this.children.length; i++) {
    this.children[i].render();
  }
};

TreeObject.prototype.isVisible = function() {
  return !this.computedAcls.private;
};

TreeObject.prototype.setPrivate = function(isPrivate) {
  this.acls.private = isPrivate;
  
  this.changeAccess();
};

TreeObject.prototype.changeAccess = function(inherited) {
  if (!inherited) {
    inherited = $.extend({}, this.parent.acls);
  }
  
  this.computedAcls = $.extend({}, this.acls, inherited);
  
  if (inherited.private || this.acls.private) {
    this.computedAcls.private = true;
  }
  
  console.log(this.data.title, this.computedAcls);
  
  for (var i = 0; i < this.children.length; i++) {
    this.children[i].changeAccess(this.computedAcls);
  }
};


///////////////////////////////////////////////////////

function ContainerSettingsForm(treeObj) {
  this.treeObj = treeObj;
};

ContainerSettingsForm.prototype.constructor = ContainerSettingsForm;

ContainerSettingsForm.prototype.render = function(parentElement) {
  var self = this;
  var template = _.template($("#container_settings").html());
  
  this.element = $(template({
    tobj : this.treeObj
  }));
  parentElement.html(this.element);
  
  this.populateRoles();
  
  $("input[name='everyoneRadio']:radio", this.element).change(function() {
    var value = $(this).val();
    if (value == "private") {
      self.treeObj.acls.everyone = null;
      self.treeObj.acls.private = true;
    } else {
      self.treeObj.acls.everyone = $(this).val();
      self.treeObj.acls.private = false;
    }
    
    console.log("Changed everyone setting", self.treeObj.data.everyone);
    
    self.treeObj.changeAccess();
  });
  
  // Add a new role assignment to the select object
  $(".add-role-form", this.element).submit(function(e){
    var role = $("select[name='roleValue']", self.element).val();
    var entity = $("input[name='entityName']", self.element).val();
    
    if (!self.treeObj.acls.roles) {
      self.treeObj.acls.roles = {};
    }
    
    if (entity in self.treeObj.acls.roles) {
      alert(entity + " is already assigned");
      return;
    }
    console.log("Adding to role", entity, role);
    self.treeObj.acls.roles[entity] = role;
    
    self.populateRoles();
    
    self.treeObj.changeAccess();
    
    e.preventDefault();
  });
};

ContainerSettingsForm.prototype.populateRoles = function() {
  if (this.treeObj.data.roles) {
    var template = _.template($("#staff-roles-template").html());
    
    var rolesContainer = $(".staff-roles", this.element);
    var rolesList = template({
      tobj : this.treeObj
    });
    
    rolesContainer.html(rolesList);
  }
};

$(document).ready(function(){
  $.ajax({
    url : "rla.json",
    dataType : "json",
  }).done(function(data){
    var authInfo = {"groups" : ["everyone"]};
    
    // Initialize the tree
    var treeRoot = $("#tree_root");
    var treeRootObj = new TreeObject(data[0], {
      childrenContainer : treeRoot.children(".tree-children")
    }, authInfo);
    treeRootObj.changeAccess();
    // Render the tree
    treeRootObj.render();
    
    var settingsContainer = $("#settings_container");
    var selectedId;
    // Bind selection event for collection objects which populates settings form
    treeRoot.on("click", ".tree-Collection", function(e) {
      var selectedObj = $(this).closest(".tree-object").data("treeObj");
      if (selectedObj.data.id != selectedId) {
        $(".selected-tree-obj").removeClass("selected-tree-obj");
        selectedObj.element.addClass("selected-tree-obj");
        
        selectedId = selectedObj.data.id;
        console.log("Selecting ", selectedId);
        
        var formObj = new ContainerSettingsForm(selectedObj);
        formObj.render(settingsContainer);
      }
    });
    
    // Bind change event for toggle if an object is private
    treeRoot.on("change", "input[name='checkPrivate']", function(e) {
      var selectedObj = $(this).closest(".tree-object").data("treeObj");
      var isPrivate = $(this).prop("checked");
      selectedObj.setPrivate(isPrivate);
    });
    
    // Bind changing of the current users credentials
    $(".set-auth-form").submit(function(e){
      e.preventDefault()
      
      authInfo.user = $("#auth_user").val();
      authInfo.groups = $("#auth_groups").val().split(" ");
    });
  })
});


