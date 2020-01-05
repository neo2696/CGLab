#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

///////////////////////////////////////////////////////////////////////////////
// Material
///////////////////////////////////////////////////////////////////////////////
uniform vec3 material_color;
uniform float material_reflectivity;
uniform float material_metalness;
uniform float material_fresnel;
uniform float material_shininess;
uniform float material_emission;

uniform int has_emission_texture;
layout(binding = 5) uniform sampler2D emissiveMap;

///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
layout(binding = 6) uniform sampler2D environmentMap;
layout(binding = 7) uniform sampler2D irradianceMap;
layout(binding = 8) uniform sampler2D reflectionMap;
uniform float environment_multiplier;

//Shadow Map

in vec4 shadowMapCoord;
//layout(binding = 10) uniform sampler2D shadowMapTex;
layout(binding = 10) uniform sampler2DShadow shadowMapTex;
///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////
uniform vec3 point_light_color = vec3(1.0, 1.0, 1.0);
uniform float point_light_intensity_multiplier = 100.0;

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////
#define PI 3.14159265359

///////////////////////////////////////////////////////////////////////////////
// Input varyings from vertex shader
///////////////////////////////////////////////////////////////////////////////
in vec2 texCoord;
in vec3 viewSpaceNormal;
in vec3 viewSpacePosition;

///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////
uniform mat4 viewInverse;
uniform vec3 viewSpaceLightPosition;
uniform mat4 lightMatrix;

uniform vec3 viewSpaceLightDir;
uniform float spotOuterAngle;
uniform float spotInnerAngle;

///////////////////////////////////////////////////////////////////////////////
// Output color
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) out vec4 fragmentColor;



vec3 calculateDirectIllumiunation(vec3 wo, vec3 n)
{
	
	vec3 wi =normalize(viewSpaceLightPosition - viewSpacePosition);
	///////////////////////////////////////////////////////////////////////////
	// Task 1.2 - Calculate the radiance Li from the light, and the direction
	//            to the light. If the light is backfacing the triangle,
	//            return vec3(0);
	///////////////////////////////////////////////////////////////////////////
	float d = distance(viewSpaceLightPosition,viewSpacePosition);
	vec3 Li= point_light_intensity_multiplier * point_light_color * (1/(d * d));
	float ndotwi = max(0, dot(n, wi));
	float ndotwo = max(0, dot(n, wo));
	float denom = 4 * ndotwo * ndotwi;

	if(denom <=0 )
	{
		return vec3(0.0); 
	}
		///////////////////////////////////////////////////////////////////////////
		// Task 1.3 - Calculate the diffuse term and return that as the result
		///////////////////////////////////////////////////////////////////////////
		 vec3 diffuse_term = material_color * (1.0/PI) * ndotwi * Li;

	///////////////////////////////////////////////////////////////////////////
	// Task 2 - Calculate the Torrance Sparrow BRDF and return the light
	//          reflected from that instead
		vec3 wh=normalize(wi+wo);
		//the fresnel term
		float Fwi = material_fresnel + (1- material_fresnel) * pow(1 - dot(wh,wi),5);
		//D, the Microfacet Distribution Function. 
		float Dwh = ( (material_shininess + 2) / (2 * PI) ) * (pow((dot(n,wh)),material_shininess));
		//G, the shadowing/masking function.
		float Gwiwo = min(1,min(2 * (dot(n,wh) * ndotwo)/ dot(wo,wh) , 2 * (dot(n,wh) * ndotwi)/ dot(wo,wh) ) ) ;

		float brdf = (Fwi * Dwh * Gwiwo) / denom;
		//return vec3(Fwi);
	///////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////
	// Task 3 - Make your shader respect the parameters of our material model.
	///////////////////////////////////////////////////////////////////////////
	vec3 dielectric_term = brdf * ndotwi * Li + (1 - Fwi) * diffuse_term;
	vec3 metal_term = brdf * material_color * ndotwi * Li;
	
	vec3 microfacet_term = material_metalness * metal_term + (1 - material_metalness) * dielectric_term;

	//return diffuse_term;
	//return brdf * dot(n, wi) * Li;
	return material_reflectivity * microfacet_term +(1 - material_reflectivity) * diffuse_term;
}

vec3 calculateIndirectIllumination(vec3 wo, vec3 n)
{
	vec3 indirect_illum = vec3(0.f);
	//return indirect_illum;
	///////////////////////////////////////////////////////////////////////////
	// Task 5 - Lookup the irradiance from the irradiance map and calculate
	//          the diffuse reflection
	///////////////////////////////////////////////////////////////////////////
	vec3 nws = normalize(vec3(viewInverse * vec4(n,0)));
	
	float theta = acos(max(-1.0f, min(1.0f, nws.y)));
	float phi = atan(nws.z, nws.x);
	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}
	vec2 lookup = vec2(phi / (2.0 * PI), theta / PI);
	vec3 irradiance =  environment_multiplier * texture(irradianceMap, lookup).xyz;
	vec3 diffuse_term = material_color * (1.0/PI) * irradiance;
	///////////////////////////////////////////////////////////////////////////
	// Task 6 - Look up in the reflection map from the perfect specular
	//          direction and calculate the dielectric and metal terms.
	///////////////////////////////////////////////////////////////////////////
	vec3 wi =normalize(reflect(-wo,n)); // calulated wi using reflect function
	vec3 Wi= normalize(vec3(viewInverse * vec4(wi,0))); // convering wi to world space 
	
	theta = acos(max(-1.0f, min(1.0f, Wi.y)));
	phi = atan(Wi.z, Wi.x);
	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}
	float roughness = sqrt(sqrt(2/(material_shininess+2)));
	lookup = vec2(phi / (2.0 * PI), theta / PI);
	vec3 Li = environment_multiplier * textureLod(reflectionMap, lookup, roughness * 7.0).xyz;
	vec3 wh=normalize(wi+wo);
	
	
	//the fresnel term
	float Fwi = material_fresnel + (1- material_fresnel) * pow(1 - dot(wh,wi),5);
	
	vec3 dielectric_term = Fwi * Li + (1-Fwi) * diffuse_term;
	
	vec3 metal_term = Fwi * material_color * Li;
	//return indirect_illum;
	//return diffuse_term;
	vec3 microfacet_term = material_metalness * metal_term + (1 - material_metalness) * dielectric_term;
	return material_reflectivity * microfacet_term +(1 - material_reflectivity) * diffuse_term;
	
}


void main()
{
	float visibility = 1.0;
	float attenuation = 1.0;

	vec4 shadowMapCoord = lightMatrix * vec4(viewSpacePosition, 1.f);

	//float depth = texture(shadowMapTex, shadowMapCoord.xy / shadowMapCoord.w).x;
	//visibility = (depth >= (shadowMapCoord.z / shadowMapCoord.w)) ? 1.0 : 0.0;
	 visibility = textureProj( shadowMapTex, shadowMapCoord );

	vec3 wo = -normalize(viewSpacePosition);
	vec3 n = normalize(viewSpaceNormal);

	vec3 posToLight = normalize(viewSpaceLightPosition - viewSpacePosition);
	float cosAngle = dot(posToLight, -viewSpaceLightDir);

// Spotlight with hard border:
	//float spotAttenuation = (cosAngle > spotOuterAngle) ? 1.0 : 0.0;
	float spotAttenuation = smoothstep(spotOuterAngle, spotInnerAngle, cosAngle);
	visibility *= spotAttenuation;


	// Direct illumination
	vec3 direct_illumination_term = visibility * calculateDirectIllumiunation(wo, n);

	// Indirect illumination
	vec3 indirect_illumination_term = calculateIndirectIllumination(wo, n);

	///////////////////////////////////////////////////////////////////////////
	// Add emissive term. If emissive texture exists, sample this term.
	///////////////////////////////////////////////////////////////////////////
	vec3 emission_term = material_emission * material_color;
	
	if(has_emission_texture == 1)
	{
		emission_term = texture(emissiveMap, texCoord).xyz;
	}

	vec3 shading = direct_illumination_term + indirect_illumination_term + emission_term;
	
	vec3 final_color = direct_illumination_term + indirect_illumination_term + emission_term;
	
	if(any(isnan(final_color)))
	{
		final_color.xyz = vec3(1.f, 0.f, 1.f);
	}

	fragmentColor = vec4(shading, 1.0);
	return;
}
