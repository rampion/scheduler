function $(id) { return document.getElementById(id); };
function appendHTML(id, html) { $(id).innerHTML = $(id).innerHTML.concat(html); };
function append(id, elt_type, html) {
	const elt = document.createElement(elt_type);
	$(id).appendChild(elt);
	elt.innerHTML = html;
	return elt;
}
if (!console) {
	console = { __noSuchMethod__ : function (name, msg) { alert(name + ": " + msg) } };
}

function to_minute_of_day(timestring) {
	const match = timestring.match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
	if (match) {
		var hour = parseInt(match[1].replace(/^0/, ''));
		const minute = parseInt(match[2].replace(/^0/, ''));
		const meridian = match[3].toLowerCase();
		if (hour == 12 && meridian == "am") {
			hour = 0;
		}
		else if (hour < 12 && meridian == "pm") {
			hour += 12;
		}
		return hour*60 + minute;
	}
};
function to_string(timespan) {
	return "from "+timespan.start + " to " + timespan.end + " on day " + timespan.day;
};
function comp_timespans(a,b) {
	return	a.day < b.day ? -1
				: a.day > b.day ? +1
				: a.end_minute <= b.start_minute ? -1
				: a.start_minute >= b.end_minute ? +1
				: 0; // not equal, just overlapping - but this suffices
};
function prep_timespans(timespans) {
	timespans.forEach(function(timespan) {
			timespan.start_minute = to_minute_of_day(timespan.start);
			timespan.end_minute = to_minute_of_day(timespan.end);
	});
	return timespans.sort(comp_timespans);
};
// check for scheduling conflicts
// and if you don't find any, add event to resource and vice versa
//
// throws error when finds conflict
function bind_event_resource(event, resource) {
	const conflicts = {};
	var num_conflicts = 0;
	const event_timespans = prep_timespans(event.timespans);

	resource.events.forEach(function(other) {
		const other_timespans = prep_timespans(other.timespans);
		var e = 0;
		var o = 0;
		while (e < event_timespans.length && o < other_timespans.length) {
			const event_timespan = event_timespans[e];
			const other_timespan = other_timespans[o];
			const comp = comp_timespans(event_timespan, other_timespan);

			//console.log("("+to_string(event_timespan)+") <=> ("+to_string(other_timespan)+") = "+comp);

			switch(comp) {
			case -1: e++; break;
			case +1: o++; break;
			case 0:	
				if (!conflicts[other.id]) {
					conflicts[other.id] = { other:other, pairs:[] };
				}
				num_conflicts++;
				conflicts[other.id].pairs.push({other_timespan:other_timespan, event_timespan:event_timespan});
				if (event_timespan.end_minute <= other_timespan.end_minute) {
					e++;
				} else {
					o++;
				}
			}
		}
	});

	if (num_conflicts> 0) {
		var msg = event.name + " conflicts with:\n";
		for (other_id in conflicts) {
			val = conflicts[other_id];
			msg += "* "+ val.other.name + "\n";
			val.pairs.forEach(function(pair){
				msg += "  - "+to_string(pair.event_timespan)+" overlaps with "+to_string(pair.other_timespan)+"\n";
			});
		}
		throw msg;
	}

	event.resources.push(resource);
	resource.events.push(event);
};
// remove the association between an event and a resource
function unbind_event_resource(event, resource) {
	event.resources.splice( event.resources.indexOf(resource), 1 );
	resource.events.splice( resource.events.indexOf(event), 1 );
}
function to_filename( shortname ) { return getCurrentDirectory() + 'projects/' + shortname + '.json'; }
function popover_prompt( label, ok , action ) {
	try { 
		$('popover').style.display = 'block';
		$('popover-label').innerHTML = label;
		$('popover-ok').innerHTML = ok;
		var on_ok = function(ev) { 
			try { 
				$('popover-ok').removeEventListener('click', on_ok, false);
				$('popover').style.display = 'none';
				var shortname = $('popover-input').value
				if (shortname !="") {
					var filename = to_filename( shortname )
					action(filename);
				}
			} catch(e) {
				alert("whoops! Something went wrong - " + e);
			}
		};
		$('popover-ok').addEventListener('click', on_ok, false);
	} catch (e) {
		alert("couldnt' set up the popover - sorry - "+e);
	}
}
var project = null;
var filename = null;
function reset()
{
	$('save-project').disabled = true;
	$('save-project-as').disabled = true;
	$('project-header').style.display = 'none';
}
function add_option(type) {
	return function(item) {
		var optgrp = $('existing-'+type);
		var option = document.createElement('option');
		option.innerHTML = item.name;
		option.id = 'option-'+item.id
		option.value = optgrp.childNodes.length;
		optgrp.appendChild(option);
		return $(type).length - 1;
	};
};
var ID = 0;
const create_new = {
	events : function() { return {
			id: 'event'+ID++,
			name: "(Enter event name)",
			description: "(Enter event description)",
			timespans: [],
			resources: []
  }; },
	resources: function() { return {
			id: 'resource'+ID++,
			name: "(Enter resource name)",
			description: "(Enter resource description)",
			events: []
	}; },
	timespans: function() { return {
			id: 'timespan'+ID++,
			start: "12:00 am",
			end: "11:59 pm",
			day: "A"
	}; }
};
function link_name(id, obj, option) { 
	$(id).value = obj.name;
	$(id).addEventListener('change', function (ev) {
			obj.name = ev.target.value;
			option.innerHTML = ev.target.value;
			return false;
	}, false);
};
function link(id, obj, attrib) { 
	$(id).value = obj[attrib]
	$(id).addEventListener('change', function (ev) {
			obj[attrib] = ev.target.value;
			return false;
	}, false);
};
const display = { // keep the option up to date with the name
	events : function(event) { 
		const option = $('option-'+event.id);
		const calendar_id = event.id + '-calendar';
		const new_timespan_id = event.id + '-timespan-new';
		const new_timespan_html = $('new-timespan-template').innerHTML.replace(/#{timespan}/g, new_timespan_id);
		const calendar_html = $('calendar-template').innerHTML.replace(/#{id}/g, calendar_id)
		const event_html = $('event-template').innerHTML.replace(/#{([^}]+)}/g, function(m, m1) {
				switch (m1) {
				case 'calendar'			: return calendar_html;
				case 'new-timespan' : return new_timespan_html;
				case 'id'						: return event.id;
				default							: return m1;
				}
		});
		const div = append('display-area', 'div', event_html)
		div.id = event.id;
		div.className = 'item';

		link_name(event.id +'-name', event, option);
		link(event.id +'-description', event, 'description');
		$(event.id+'-delete').addEventListener('click', function(ev) {
			try {
				if (confirm("Really delete this event?")) {
					event.resources.forEach(function(resource){
						unbind_event_resource(event, resource);
					});
					project.events.splice(project.events.indexOf(event), 1);
					option.parentNode.removeChild(option);
					$(event.id).parentNode.removeChild($(event.id));
					$('events').selectedIndex = -1;
				}
			} catch (e) {
				alert( "Unable to fully delete resource: " + e);
			}
		}, false);

		// ADD TIMESPANS
    function show_timespan(klass, timespan) {
			timespan.start_minute = to_minute_of_day(timespan.start);
			timespan.end_minute = to_minute_of_day(timespan.end);

			const column_id = calendar_id + '-day-' + timespan.day;
			const top = timespan.start_minute - 8*60 + 20;
			const height = timespan.end_minute - timespan.start_minute;

			console.log("showing " + timespan.id + " "+timespan.toSource());
			//console.log({top:top,height:height});
			const cal_timespan_id = calendar_id+'-'+timespan.id;
			appendHTML(column_id, '<div class="timespan '+klass+'" id="'+cal_timespan_id+'"></div>');
			$(cal_timespan_id).style.top = top;
			$(cal_timespan_id).style.height= height;
      return cal_timespan_id;
    };
		const existing_timespan_template = $('existing-timespan-template').innerHTML;
		function add_timespan(timespan) { 
      const cal_timespan_id = show_timespan('event1', timespan);

      const list_timespan_id = event.id+'-'+timespan.id;
      const list_timespan_div = append(event.id+'-existing-timespans', 'div',
          existing_timespan_template.replace(/#{timespan}/g, list_timespan_id)
      );
      list_timespan_div.className = 'timespan-item exisiting';
      list_timespan_div.id = list_timespan_id;
      $(list_timespan_id+'-description').innerHTML = to_string(timespan);

      $(list_timespan_id+'-remove').addEventListener('click', function(ev) {
          list_timespan_div.parentNode.removeChild($(list_timespan_id));
          $(cal_timespan_id).parentNode.removeChild($(cal_timespan_id));
          event.timespans.splice( event.timespans.indexOf(timespan), 1 );
      }, false);
		};
		event.timespans.forEach(add_timespan);

		$(new_timespan_id+'-add').addEventListener('click', function(ev) {
			const timespan = create_new.timespans();
			timespan.start =  $(new_timespan_id+'-start-hour').value+":"+
												$(new_timespan_id+'-start-minute').value+" "+
												$(new_timespan_id+'-start-meridian').value.toLowerCase();
			timespan.end =  $(new_timespan_id+'-end-hour').value+":"+
											$(new_timespan_id+'-end-minute').value+" "+
											$(new_timespan_id+'-end-meridian').value.toLowerCase();
			timespan.day = $(new_timespan_id+'-day').value;

			// validate timespan
			const checklist = [];
			checklist.push({event:event, message:"current event "+event.name});
			event.resources.forEach(function(resource) {
				resource.events.forEach(function(other_event) {
						if (event != other_event) {
							checklist.push({event:other_event, message:"event "+other_event.name+" for resource "+resource.name});
						}
				});
			});
			const conflicts = [];
			timespan.start_minute = to_minute_of_day(timespan.start);
			timespan.end_minute = to_minute_of_day(timespan.end);
			checklist.forEach(function(checkitem){
				prep_timespans(checkitem.event.timespans).forEach(function(other){
					if (comp_timespans(timespan, other) == 0) {
						console.log("conflict");
						console.log(timespan);
						console.log(other);
						conflicts.push("* "+checkitem.message+" "+to_string(other));
					}
				});
			});
			if (conflicts.length > 0) {
				alert("Can't add new timespan "+to_string(timespan)+", conflicts with\n"+ conflicts.join("\n"));
				return false;
			}

			event.timespans.push(timespan);
			add_timespan(timespan);
		}, false);

		// ADD RESOURCES
		// modify HTML
		const eresource_template = $('existing-resource-template').innerHTML;
		const oresource_template = $('other-resource-template').innerHTML;
		project.resources.forEach(function(resource) {
			const oresource_id = event.id + '-other-' + resource.id;
			const oresource_html = oresource_template.replace(/#{resource}/g, oresource_id);
			const eresource_id = event.id + '-existing-' + resource.id;
			const eresource_html = eresource_template.replace(/#{resource}/g, eresource_id);
			appendHTML(event.id + '-existing-resources', eresource_html);
			appendHTML(event.id + '-other-resources', oresource_html);
		});

    other_count = {};
    other_timespans = {};
		project.events.forEach(function(other) { 
        other_count[other.id] = 0; 
        other_timespans[other.id] = [];
    });

		// then attach event listeners
		project.resources.forEach(function(resource) {
			const oresource_id = event.id + '-other-' + resource.id;
			const eresource_id = event.id + '-existing-' + resource.id;
			$(oresource_id).innerHTML = resource.name;
			$(oresource_id).value = resource.id;
			
			$(eresource_id + '-name').innerHTML = resource.name;
			$(eresource_id + '-remove').addEventListener('click', function(){
				try { 
					//console.log("removing "+eresource_id);
					unbind_event_resource(event, resource);

					$(oresource_id).style.display = 'block';
					$(eresource_id).style.display = 'none';

          resource.events.forEach(function(other) { 
            if (other == event) { return; }
            other_count[other.id]--;
            if (other_count[other.id] == 0) {
              other_timespans[other.id].forEach(function(timespan_id) {
                $(timespan_id).parentNode.removeChild($(timespan_id));
              });
              other_timespans[other.id] = [];
            }
          });
				}
				catch (e) {
					alert("Unable to remove resource : " + e);
				}
			}, false);
			//console.log("added event listener for " + resource.name + "["+eresource_id+"]");
		});
    function show_resource(resource) {
			const eresource_id = event.id + '-existing-' + resource.id;
			const oresource_id = event.id + '-other-' + resource.id;
			$(eresource_id).style.display = 'block';
			$(oresource_id).style.display = 'none';

      resource.events.forEach(function(other) { 
        if (other == event) { return; }
        if (other_count[other.id] == 0) {
          other.timespans.forEach(function(timespan) {
            timespan_id = show_timespan('event0', timespan)
            $(timespan_id).innerHTML = other.name;
            other_timespans[other.id].push( timespan_id );
          });
        }
        other_count[other.id]++;
      });
    };
		event.resources.forEach(show_resource);
		$(event.id + '-other-resources').selectedIndex = -1;
		$(event.id + '-other-resources').addEventListener('change', function(ev) {
			try { 
				const resource_id = ev.target.value;
				const resource = project.resources.filter(function(resource){return resource.id == resource_id})[0];

				bind_event_resource(event, resource);

        show_resource(resource);
			} catch(e) {
				alert("Unable to add resource : " + e);
			}
			$(event.id + '-other-resources').selectedIndex = -1;
		}, false);
	},
	resources: function(resource) { 
		const option = $('option-'+resource.id);
		const calendar_id = resource.id + '-calendar';
		const calendar_html = $('calendar-template').innerHTML.replace(/#{id}/g, calendar_id)
		const resource_html = $('resource-template').innerHTML.replace(/#{([^}]+)}/g, function(m, m1) {
				switch (m1) {
				case 'calendar'			: return calendar_html;
				case 'id'						: return resource.id;
				default							: return m1;
				}
		});
		const div = append('display-area', 'div', resource_html)
		div.id = resource.id;
		div.className = 'item';

		link_name(resource.id +'-name', resource, option);
		link(resource.id +'-description', resource, 'description');
		$(resource.id+'-delete').addEventListener('click', function(ev) {
			try{ 
				if (confirm("Really delete this resource?")) {
					resource.events.forEach(function(event){
						unbind_event_resource(event, resource);
					});
					project.resources.splice(project.resources.indexOf(resource), 1);
					option.parentNode.removeChild(option);
					$(resource.id).parentNode.removeChild($(resource.id));
					$('resources').selectedIndex = -1;
				}
			} catch (e) {
				alert( "Unable to fully delete resource: " + e);
			}
		}, false);

		// ADD TIMESPANS
		var class_num = 0;
				
		function show_timespans(event) { 
				class_num %= 6;
				class_num++;
				event.timespans.forEach( function (timespan) {
					timespan.start_minute = to_minute_of_day(timespan.start);
					timespan.end_minute = to_minute_of_day(timespan.end);

					const column_id = calendar_id + '-day-' + timespan.day;
					const top = timespan.start_minute - 8*60 + 20;
					const height = timespan.end_minute - timespan.start_minute;
					//console.log(timespan);
					//console.log({top:top,height:height});
					const cal_timespan_id = calendar_id+'-'+timespan.id;
					appendHTML(column_id, '<div class="timespan event'+class_num+'" id="'+cal_timespan_id+'">'+
						event.name+'</div>');
					$(cal_timespan_id).style.top = top;
					$(cal_timespan_id).style.height= height; 
				});
		};
		resource.events.forEach(show_timespans);

		// ADD EVENTS
		// modify HTML
		const revent_template = $('existing-event-template').innerHTML;
		const oevent_template = $('other-event-template').innerHTML;
		project.events.forEach(function(event) {
			const oevent_id = resource.id + '-other-' + event.id;
			const oevent_html = oevent_template.replace(/#{event}/g, oevent_id);
			const revent_id = resource.id + '-existing-' + event.id;
			const revent_html = revent_template.replace(/#{event}/g, revent_id);
			appendHTML(resource.id + '-existing-events', revent_html);
			appendHTML(resource.id + '-other-events', oevent_html);
		});
		// then attach resource listeners
		project.events.forEach(function(event) {
			const oevent_id = resource.id + '-other-' + event.id;
			const revent_id = resource.id + '-existing-' + event.id;
			$(oevent_id).innerHTML = event.name;
			$(oevent_id).value = event.id;
			
			$(revent_id + '-name').innerHTML = event.name;
			$(revent_id + '-remove').addEventListener('click', function(){
				try { 
					//console.log("removing "+revent_id);
					unbind_event_resource(event, resource)

					$(oevent_id).style.display = 'block';
					$(revent_id).style.display = 'none';
					event.timespans.forEach(function(timespan) { 
						const cal_timespan_id = calendar_id+'-'+timespan.id;
						$(cal_timespan_id).parentNode.removeChild($(cal_timespan_id));
					});
				}
				catch (e) {
					alert("Unable to remove event : " + e);
				}
			}, false);
		});
		resource.events.forEach(function(event) {
			const revent_id = resource.id + '-existing-' + event.id;
			const oevent_id = resource.id + '-other-' + event.id;
			$(revent_id).style.display = 'block';
			$(oevent_id).style.display = 'none';
		});
		$(resource.id + '-other-events').selectedIndex = -1;
		$(resource.id + '-other-events').addEventListener('change', function(ev) {
			try { 
				const event_id = ev.target.value;
				const event = project.events.filter(function(event){return event.id == event_id})[0];

				bind_event_resource(event, resource);

				const revent_id = resource.id + '-existing-' + event.id;
				const oevent_id = resource.id + '-other-' + event.id;
				$(revent_id).style.display = 'block';
				$(oevent_id).style.display = 'none';
				show_timespans(event);
			} catch(e) {
				alert("Unable to add event : " + e);
			}
			$(resource.id + '-other-events').selectedIndex = -1;
		}, false); 
	}
};
// display an existing item, or a new one
function on_select_change(type) {
	return function(ev) {
		try { 
			if (type == 'events') {
				$('resources').selectedIndex = -1;
			} else {
				$('events').selectedIndex = -1;
			}
			var index = ev.target.value;
			if (index == "new") {
				var item = create_new[type]()
				index = project[type].length;
				project[type].push( item );
				ev.target.selectedIndex = add_option(type)(item);
			}
			$('display-area').style.display = 'none';
			$('display-area').innerHTML = '';
			display[type](project[type][index]);
			$('display-area').style.display = 'block';
		} catch (e) {
			alert("problem changing selection : " + e);
		}
	};
};
function refresh( _project, _filename )
{
  try {
		$('project-name').value = _project.name;
		$('project-description').value = _project.description;
		$('existing-events').innerHTML = "";
		_project.events.forEach(add_option('events'));
		$('existing-resources').innerHTML = "";
		_project.resources.forEach(add_option('resources'));
    // ...
		$('events').selectedIndex = -1;
		$('resources').selectedIndex = -1;
    $('save-project').disabled = false;
    $('save-project-as').disabled = false;
		$('project-header').style.display = 'block';
    project = _project;
    filename = _filename;
  } catch (ex) {
    if (project && filename) {
      refresh(project, filename);
    } else {
			reset();
    }
    throw(ex);
  }
}
function load_project( _filename ) {
	try { 
		var _json = mozillaLoadFile( _filename );
		if (_json) {
			var _project = eval(_json);
			if (_project.name && 
					_project.description && 
					_project.events && 
					_project.resources) {
				ID = 0;
				_project.events.forEach(function(event){ 
						event.id = 'event'+ID++; 
						event.timespans.forEach(function(timespan){ timespan.id = 'timespan'+ID++ });
				});
				_project.resources.forEach(function(resource){ resource.id = 'resource'+ID++; });
				refresh(_project, _filename);
			}
			else { 
				throw "(not a project file)";
			}
		} else {
			ID = 0;
			refresh( { 
				name:"(Enter project name)", 
				description:"(Enter project description)", 
				events:[], resources:[] }, _filename );
		}
		$('display-area').innerHTML = '';
	} catch(ev) {
		alert( "Unable to load project from file " + _filename + "\n" + ev );
	}
};
window.onload = function(ev) { 
  try {
    // normalize the prompt input text
    $('popover-input').addEventListener('change', function(ev) {
      $('popover-input').value = $('popover-input').value.replace(/\W/g, function(m) { return m.match(/\s/) ? '-' : '' }).toLowerCase();
    }, false);
		// close the popover
    $('popover-cancel').addEventListener('click', function(ev) {
        $('popover').style.display = 'none';
    }, false);
		// open a new project, using the popover
    $('open-project').addEventListener('click', function(ev) { 
        popover_prompt("Enter a shortname for the new project:", "Open", load_project);
    }, false);
		// save the current project to file.
    $('save-project').addEventListener('click', function(ev) { 
        if (!mozillaSaveFile(filename , project.toSource() )) {
          alert( "Unable to save project to file " + filename + "\n" + ev );
        }
    }, false);
		// save the current project as a different project name (using the popover)
    $('save-project-as').addEventListener('click', function(ev) { 
        popover_prompt("Enter a new shortname for the project:", "Save As", function( _filename ) {
          if (mozillaSaveFile( _filename, project.toSource() )) {
            filename = _filename;
          } else { 
            alert( "Unable to save project to file " + _filename + "\n" + ev );
          }
        });
    }, false);
		// record any project name changes made by the user
		$('project-name').addEventListener('change', function(ev) { 
				project.name = $('project-name').value; 
		}, false);
		// record any project description changes made by the user
		$('project-description').addEventListener('change', function(ev) { 
				project.description = $('project-description').value; 
		}, false);
		// let the user choose to display an event or a resource
		$('events').addEventListener('change', on_select_change('events'), false);
		$('resources').addEventListener('change', on_select_change('resources'), false);
		$('show-all').addEventListener('click', function(ev) {
			$('display-area').style.display = 'none';
			$('display-area').innerHTML = '';
			append('display-area', 'h3', 'Resources').className = 'clear';
			project.resources.forEach(function(resource) { 
				display.resources(resource); 
			});
			append('display-area', 'h3', 'Events').className = 'clear';
			project.events.forEach(function(event) { 
				display.events(event); 
			});
			$('display-area').style.display = 'block';
		}, false);
		reset();

		// TESTING
		//load_project(to_filename('example_project'));
		//on_select_change('resources')( { target: { value: 0, selectedIndex: 1, options: $('resources')  } } );
  } catch(ex) {
    alert(ex);
  }
};
