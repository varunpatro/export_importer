var aei = require("../");

var ImportObject = module.exports = aei.ideal.Proto.extend().setType("ImportObject").newSlots({
    resourceName: "Clones should set",
    sourceId: null,
    asanaId: null
}).setSlots({
    setSourceId: function(sourceId) {
        this._sourceId = sourceId;
        var asanaId = this.app().sourceToAsanaMap().at(sourceId);
        if (asanaId) {
            this._asanaId = asanaId;
        }
        return this;
    },

    setAsanaId: function(asanaId) {
        this._asanaId = asanaId;
        if (asanaId) {
            this.app().sourceToAsanaMap().atPut(this.sourceId(), asanaId);
        }
        return this;
    },

    create: function() {
        var data = this._resourceData();
        if (this.app().clientCache()) {
            // disambiguates requests when caching for resuming
            data._sourceId = this.sourceId();
        }
        var response;
        try {
            response = this._createResource(data);
        } catch (ex) {
            console.log("Crashed while creating resource", data);
            throw ex;
        }
        this.setAsanaId(response.id);
        return this;
    },

    _createResource: function(resourceData) {
        return aei.Future.withPromise(this._resource().create(resourceData)).wait();
    },

    _resource: function() {
        return this._resourceNamed(this.resourceName());
    },

    _resourceNamed: function(name) {
        return this.app().apiClient()[name];
    },

    _resourceData: function() {
        throw "Clones should override";
    }
});
