require 'json'

orig_array = JSON.parse(file = File.read(ARGV[0]))
id_hash = Hash.new
tree_roots = Array.new

orig_array.each do |object_data|
  id_hash[object_data["id"]] = object_data
end

orig_array.each do |object_data|
  readGroups = object_data["readGroup"]
  if readGroups != nil && !(readGroups.include? "public")
    object_data["access"] = 0
  end
  object_data.delete("readGroup")
  
  ancestor_ids = object_data["ancestorIds"]
  ancestor_array = ancestor_ids.split("/")
  object_data.delete("ancestorIds")
  
  parent = ancestor_array[-1]
  if parent == object_data["id"]
    parent = ancestor_array[-2]
  end
  
  if id_hash.key? parent
    
    if !(id_hash[parent].key? "children")
      id_hash[parent]["children"] = Array.new
    end
    id_hash[parent]["children"] << object_data
  else
    tree_roots << object_data
  end
end

def trim_perms(object_data, parent_data, clear_perm)
  if (clear_perm != nil && clear_perm == object_data["access"]) ||
      (parent_data != nil && parent_data["access"] == object_data["access"])
    clear_perm = object_data["access"]
    object_data.delete("access")
  end
  
  if object_data.key? "children"
    object_data["children"].each do |child|
      trim_perms(child, object_data, clear_perm)
    end
  end
end

tree_roots.each do |root|
  trim_perms(root, nil, nil)
end

puts JSON.pretty_generate(tree_roots)
